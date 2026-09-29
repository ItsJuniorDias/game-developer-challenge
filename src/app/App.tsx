import { useMatchSubmissionWorker } from '../api/matchSubmission';
import { CaptainsLog } from '../features/log/CaptainsLog';
import { GameScreen } from '../features/match/GameScreen';
import { MainMenu } from '../features/menu/MainMenu';
import { OptionsScreen } from '../features/options/OptionsScreen';
import { ResultScreen } from '../features/result/ResultScreen';
import { useRoute } from './router';

export function App() {
  useMatchSubmissionWorker();
  const route = useRoute();
  switch (route.name) {
    case 'play':
      return <GameScreen />;
    case 'options':
      return <OptionsScreen />;
    case 'result':
      return <ResultScreen />;
    case 'log':
      return <CaptainsLog tab={route.tab} />;
    case 'menu':
      return <MainMenu />;
  }
}
