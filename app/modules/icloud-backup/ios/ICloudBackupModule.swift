import ExpoModulesCore
import Foundation

/// iCloud container backup of the app's SQLite snapshot (Track 43). Deliberately dumb: it moves
/// one opaque file in and out of the ubiquity container and knows nothing about the database.
///
/// The files live in the container ROOT, not `Documents/`, and the app declares no
/// `NSUbiquitousContainers` entry, so the backup stays hidden from the Files app.
///
/// `backup.db` is the latest copy; on each upload the previous latest is rotated to
/// `backup.prev.db`. Every file operation goes through `NSFileCoordinator` because the iCloud
/// daemon (bird) reads and writes the same files concurrently.
private let containerIdentifier = "iCloud.com.mattwayles.wanderlift"
private let latestName = "backup.db"
private let previousName = "backup.prev.db"
private let downloadTimeout: TimeInterval = 60

private func fail(_ code: String, _ message: String) -> Exception {
  Exception(name: "ICloudBackupException", description: message, code: code)
}

/// JS hands over either a plain path or a `file://` URL (expo-file-system style).
private func localURL(_ path: String) -> URL {
  if path.hasPrefix("file://"), let url = URL(string: path) {
    return URL(fileURLWithPath: url.path)
  }
  return URL(fileURLWithPath: path)
}

private func fileName(_ which: String?) throws -> String {
  switch which ?? "latest" {
  case "latest": return latestName
  case "previous": return previousName
  default: throw fail("ERR_INVALID_ARGUMENT", "which must be 'latest' or 'previous'")
  }
}

/// Resolves the container root. `url(forUbiquityContainerIdentifier:)` can block on first call,
/// so this must never run on the main thread (the module's functions all run on a global queue).
private func containerURL() throws -> URL {
  guard FileManager.default.ubiquityIdentityToken != nil else {
    throw fail("ERR_ICLOUD_UNAVAILABLE", "Not signed in to iCloud")
  }
  guard let url = FileManager.default.url(forUbiquityContainerIdentifier: containerIdentifier) else {
    throw fail("ERR_ICLOUD_UNAVAILABLE", "iCloud container is unavailable")
  }
  return url
}

/// The hidden stub iCloud leaves in place of an evicted file: `.<name>.icloud`.
private func placeholderURL(for url: URL) -> URL {
  url.deletingLastPathComponent().appendingPathComponent(".\(url.lastPathComponent).icloud")
}

private func existsOrEvicted(_ url: URL) -> Bool {
  let fm = FileManager.default
  return fm.fileExists(atPath: url.path) || fm.fileExists(atPath: placeholderURL(for: url).path)
}

/// Runs a coordinator call and surfaces either the coordination error or one thrown inside the
/// accessor block (which `NSFileCoordinator` cannot propagate on its own).
private func coordinated(_ body: (inout NSError?) throws -> Void) throws {
  var coordinationError: NSError?
  try body(&coordinationError)
  if let coordinationError = coordinationError { throw coordinationError }
}

public class ICloudBackupModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ICloudBackup")

    AsyncFunction("isAvailable") { () -> Bool in
      guard FileManager.default.ubiquityIdentityToken != nil else { return false }
      return FileManager.default.url(forUbiquityContainerIdentifier: containerIdentifier) != nil
    }.runOnQueue(.global(qos: .utility))

    AsyncFunction("upload") { (localPath: String) in
      let source = localURL(localPath)
      guard FileManager.default.fileExists(atPath: source.path) else {
        throw fail("ERR_SOURCE_MISSING", "Local snapshot not found")
      }
      let root = try containerURL()
      let latest = root.appendingPathComponent(latestName)
      let previous = root.appendingPathComponent(previousName)
      let temp = root.appendingPathComponent(".backup.tmp-\(UUID().uuidString)")
      let fm = FileManager.default
      var swiftError: Error?

      do {
        // Stage the full copy first so a partial copy can never sit at `backup.db`.
        try fm.copyItem(at: source, to: temp)
        try coordinated { error in
          NSFileCoordinator().coordinate(
            writingItemAt: latest, options: .forReplacing,
            writingItemAt: previous, options: .forReplacing,
            error: &error
          ) { latestURL, previousURL in
            do {
              // An evicted copy still counts: FileManager moves and removes a ubiquitous item by its
              // logical URL even while only its `.icloud` placeholder is on disk.
              if existsOrEvicted(latestURL) {
                if existsOrEvicted(previousURL) { try fm.removeItem(at: previousURL) }
                try fm.moveItem(at: latestURL, to: previousURL)
              }
              try fm.moveItem(at: temp, to: latestURL)
            } catch {
              swiftError = error
            }
          }
        }
        if let e = swiftError { throw e }
      } catch let e as Exception {
        try? fm.removeItem(at: temp)
        throw e
      } catch {
        try? fm.removeItem(at: temp)
        throw fail("ERR_UPLOAD_FAILED", error.localizedDescription)
      }
    }.runOnQueue(.global(qos: .utility))

    AsyncFunction("download") { (toPath: String, which: String?) -> Bool in
      let name = try fileName(which)
      let root = try containerURL()
      let url = root.appendingPathComponent(name)
      guard existsOrEvicted(url) else { return false }

      try Self.waitUntilDownloaded(url)

      let destination = localURL(toPath)
      let fm = FileManager.default
      var swiftError: Error?
      do {
        try coordinated { error in
          NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &error) { readURL in
            do {
              if fm.fileExists(atPath: destination.path) { try fm.removeItem(at: destination) }
              try fm.copyItem(at: readURL, to: destination)
            } catch {
              swiftError = error
            }
          }
        }
        if let e = swiftError { throw e }
      } catch {
        throw fail("ERR_DOWNLOAD_FAILED", error.localizedDescription)
      }
      return true
    }.runOnQueue(.global(qos: .utility))

    AsyncFunction("stat") { (which: String?) -> [String: Double]? in
      let name = try fileName(which)
      let root = try containerURL()
      let url = root.appendingPathComponent(name)
      guard existsOrEvicted(url) else { return nil }
      // Resource values on the real (non-placeholder) URL are answered from iCloud's metadata even
      // when the content has not been downloaded yet.
      let values = try? url.resourceValues(forKeys: [
        .contentModificationDateKey, .fileSizeKey, .totalFileSizeKey,
      ])
      guard let modified = values?.contentModificationDate else { return nil }
      let size = values?.fileSize ?? values?.totalFileSize ?? 0
      return [
        "modifiedAt": (modified.timeIntervalSince1970 * 1000).rounded(),
        "size": Double(size),
      ]
    }.runOnQueue(.global(qos: .utility))
  }

  /// Starts the iCloud download of an evicted file and polls until it is `.current`.
  private static func waitUntilDownloaded(_ url: URL) throws {
    let fm = FileManager.default
    func isCurrent() -> Bool {
      let status = try? url.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey])
        .ubiquitousItemDownloadingStatus
      return status == .current && fm.fileExists(atPath: url.path)
    }
    if isCurrent() { return }
    do {
      try fm.startDownloadingUbiquitousItem(at: url)
    } catch {
      throw fail("ERR_DOWNLOAD_FAILED", error.localizedDescription)
    }
    let deadline = Date().addingTimeInterval(downloadTimeout)
    while !isCurrent() {
      if Date() > deadline {
        throw fail("ERR_DOWNLOAD_TIMEOUT", "iCloud did not finish downloading the backup")
      }
      Thread.sleep(forTimeInterval: 0.5)
    }
  }
}
