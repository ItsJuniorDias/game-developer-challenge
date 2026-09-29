import { useMatchSubmissionWorker } from '../api/matchSubmission';
import { CaptainsLog } from '../features/log/CaptainsLog';
import { MainMenu } from '../features/menu/MainMenu';
import { OptionsScreen } from '../features/options/OptionsScreen';
import { ResultScreen } from '../features/result/ResultScreen';
import { GameRoute } from './GameRoute';
import { useRoute } from './router';

export function App() {
  useMatchSubmissionWorker();
  const route = useRoute();
  switch (route.name) {
    case 'play':
      return <GameRoute />;
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
