import { useState, useCallback } from 'react';
import DeckList from './components/DeckList.jsx';
import DeckView from './components/DeckView.jsx';
import ReviewMode from './components/ReviewMode.jsx';
import CardForm from './components/CardForm.jsx';
import ProblemDashboard from './components/ProblemDashboard.jsx';
import ProblemSession from './components/ProblemSession.jsx';
import ProblemForm from './components/ProblemForm.jsx';
import PracticeMode from './components/PracticeMode.jsx';
import History from './components/History.jsx';
import Toast from './components/Toast.jsx';

export default function App() {
  const [view, setView] = useState({ screen: 'home' });
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message) => {
    setToast(message);
  }, []);

  const navigate = useCallback((screen, params = {}) => {
    setView({ screen, ...params });
  }, []);

  let content;
  switch (view.screen) {
    case 'home':
      content = <DeckList navigate={navigate} showToast={showToast} />;
      break;
    case 'deck':
      content = <DeckView deckId={view.deckId} navigate={navigate} showToast={showToast} />;
      break;
    case 'review':
      content = <ReviewMode deckId={view.deckId} deckName={view.deckName} navigate={navigate} showToast={showToast} />;
      break;
    case 'addCard':
      content = <CardForm deckId={view.deckId} navigate={navigate} showToast={showToast} />;
      break;
    case 'editCard':
      content = <CardForm deckId={view.deckId} card={view.card} navigate={navigate} showToast={showToast} />;
      break;
    case 'problems':
      content = <ProblemDashboard navigate={navigate} showToast={showToast} />;
      break;
    case 'problemSession':
      content = <ProblemSession navigate={navigate} showToast={showToast} slugs={view.slugs || null} />;
      break;
    case 'practice':
      content = <PracticeMode concept={view.concept} navigate={navigate} showToast={showToast} />;
      break;
    case 'history':
      content = <History navigate={navigate} showToast={showToast} />;
      break;
    case 'problemForm':
      content = <ProblemForm conceptSlug={view.conceptSlug} problem={view.problem} navigate={navigate} showToast={showToast} />;
      break;
    default:
      content = <DeckList navigate={navigate} showToast={showToast} />;
  }

  return (
    <div className="app">
      {content}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
