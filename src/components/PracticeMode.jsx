import { useState, useEffect, useRef, useCallback } from 'react';
import { getPracticeProblem, recordAttempt } from '../lib/problems-api.js';
import { generateProblemsForConcept } from '../lib/generate-api.js';
import { timingVerdict } from '../lib/problem-scheduler.js';
import Rich from './Rich.jsx';

const fmtTime = (s) => `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;

/**
 * Endless practice on one topic. Bank-first: serves fresh banked problems,
 * generating a new one only when the bank runs dry. Never repeats a problem
 * within the run (each graded problem is retired anyway). Attempts are
 * logged to history but do NOT touch the review schedule.
 */
export default function PracticeMode({ concept, navigate, showToast }) {
  const [phase, setPhase] = useState('loading'); // loading | attempt | graded | done-count via results
  const [problem, setProblem] = useState(null);
  const [answer, setAnswer] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [revealedEarly, setRevealedEarly] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [saving, setSaving] = useState(false);
  const startRef = useRef(null);
  const secondsRef = useRef(0);
  const seenIdsRef = useRef([]);
  const loadingRef = useRef(false);

  const loadNext = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setPhase('loading');
    setAnswer('');
    setRevealedEarly(false);
    try {
      let next = await getPracticeProblem(concept.slug, seenIdsRef.current);
      if (!next) {
        setPhase('generating');
        const inserted = await generateProblemsForConcept(concept, { count: 1 });
        next = inserted[0];
      }
      if (!next) throw new Error('No problem available');
      seenIdsRef.current.push(next.id);
      setProblem(next);
      setPhase('attempt');
    } catch (err) {
      showToast('Error: ' + err.message);
      setPhase('error');
    } finally {
      loadingRef.current = false;
    }
  }, [concept, showToast]);

  useEffect(() => { loadNext(); }, [loadNext]);

  useEffect(() => {
    if (phase !== 'attempt') return;
    startRef.current = Date.now();
    setElapsed(0);
    const t = setInterval(() => setElapsed((Date.now() - startRef.current) / 1000), 1000);
    return () => clearInterval(t);
  }, [phase, problem]);

  const reveal = (early) => {
    secondsRef.current = Math.round((Date.now() - startRef.current) / 1000);
    setRevealedEarly(early);
    setPhase('graded');
  };

  const grade = async (outcome) => {
    setSaving(true);
    try {
      await recordAttempt({
        problem,
        concept,
        outcome,
        answerGiven: answer,
        seconds: secondsRef.current,
        revealedEarly,
        mode: 'practice',
      });
      setCompleted((n) => n + 1);
      await loadNext();
    } catch (err) {
      showToast('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <header className="header">
      <button className="btn-icon" onClick={() => navigate('problems')}>Exit</button>
      <h1 className="header-title">Practice: {concept.name}</h1>
      <span className="review-counter">{completed} done</span>
    </header>
  );

  if (phase === 'loading') {
    return <div className="screen">{header}<div className="center-message">Loading...</div></div>;
  }

  if (phase === 'generating') {
    return (
      <div className="screen">
        {header}
        <div className="review-done">
          <div className="generating-spinner" />
          <p className="review-done-text">Bank is empty — generating a fresh problem…</p>
          <p className="session-note">Usually a minute or two.</p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="screen">
        {header}
        <div className="review-done">
          <p className="review-done-text">Couldn't load a problem.</p>
          <button className="btn btn-primary" onClick={loadNext}>Try again</button>
        </div>
      </div>
    );
  }

  const target = problem.target_minutes;

  if (phase === 'attempt') {
    return (
      <div className="screen">
        {header}
        <div className="problem-card">
          <Rich text={problem.statement} className="problem-statement" />
          {problem.diagram_svg && (
            <div className="problem-diagram" dangerouslySetInnerHTML={{ __html: problem.diagram_svg }} />
          )}
          {problem.diagram_asy && !problem.diagram_svg && (
            <div className="diagram-pending">
              This problem has a diagram that isn't compiled yet — run{' '}
              <code>node scripts/compile-diagrams.mjs</code> and reload.
            </div>
          )}
        </div>
        <div className="answer-bar">
          <input
            className="answer-input"
            placeholder="Enter your answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') reveal(false); }}
          />
          <button className="btn btn-submit" onClick={() => reveal(false)}>SUBMIT</button>
          <button className="btn btn-review-grey" onClick={() => reveal(true)}>REVIEW</button>
        </div>
        <div className="attempt-meta">
          <span>{fmtTime(elapsed)}</span>
          <span>target ~{target} min</span>
        </div>
      </div>
    );
  }

  // graded
  const verdict = timingVerdict(secondsRef.current, target);
  return (
    <div className="screen">
      {header}
      <div className="problem-card problem-card-compact">
        <Rich text={problem.statement} className="problem-statement" />
        {problem.diagram_svg && (
          <div className="problem-diagram" dangerouslySetInnerHTML={{ __html: problem.diagram_svg }} />
        )}
      </div>

      {answer && <div className="your-answer"><span>Your answer:</span> {answer}</div>}
      {problem.answer && (
        <div className="reveal-block"><div className="reveal-label">Answer</div><Rich text={problem.answer} /></div>
      )}
      <div className="reveal-block"><div className="reveal-label">Rubric</div><Rich text={problem.rubric} /></div>

      <div className="timing-line">
        Took {fmtTime(secondsRef.current)} · target ~{target} min
        {verdict === 'over' && <span className="timing-over"> — over 1.5× target</span>}
        {revealedEarly && <span className="timing-over"> — revealed without submitting</span>}
      </div>
      <div className="grade-help">Practice doesn't change your review schedule — grade honestly and keep going.</div>
      <div className="review-grades">
        <button className="btn btn-again" disabled={saving} onClick={() => grade('fail')}>Fail</button>
        <button className="btn btn-weak" disabled={saving} onClick={() => grade('weak')}>Weak pass</button>
        <button className="btn btn-easy" disabled={saving} onClick={() => grade('clean')}>Clean pass</button>
      </div>
      <button className="btn btn-secondary btn-block" style={{ marginTop: 12 }} onClick={() => navigate('problems')}>
        End practice
      </button>
    </div>
  );
}
