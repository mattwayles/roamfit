/** Track 37h — Settings → "Run setup again": the first-launch setup's steps, prefilled, with the
 *  disclaimer step left out (it is already acknowledged and always in Settings). */
import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { OnboardingFlow } from '../components/OnboardingFlow';

export default function OnboardingScreen(): React.JSX.Element {
  const navigation = useNavigation();
  return <OnboardingFlow mode="review" onDone={() => navigation.goBack()} />;
}
