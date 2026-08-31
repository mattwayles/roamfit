/**
 * §4.6 `Session.engine_version` — bump whenever a change to this package could change the
 * output of `generateSession` for the same inputs. Golden tests pin behavior at a version;
 * bump this alongside any golden-test fixture update.
 */
export const ENGINE_VERSION = '2.3.0';
