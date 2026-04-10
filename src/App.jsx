import { useState, useCallback } from 'react';
import DeckList from './components/DeckList.jsx';
import DeckView from './components/DeckView.jsx';
import ReviewMode from './components/ReviewMode.jsx';
import CardForm from './components/CardForm.jsx';
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
