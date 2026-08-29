import { useState, useEffect, useRef } from 'react';
import { getSession, recordAttempt } from '../lib/problems-api.js';
import { generateProblemsForConcept } from '../lib/generate-api.js';
import { timingVerdict } from '../lib/problem-scheduler.js';
import Rich from './Rich.jsx';

const fmtTime = (s) => `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;

/**
 * One session = up to 3 problems (spec §5), interleaved and never labeled
 * with their concept. Flow per problem:
 *   refresher (forgotten concepts only) → attempt → graded → post-mortem
 *   (fails only) → result → next.
 */
export default function ProblemSession({ navigate, showToast, slugs = null }) {
  const [session, setSession] = useState(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState('loading');
  const [answer, setAnswer] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [revealedEarly, setRevealedEarly] = useState(false);
  const [changes, setChanges] = useState([]);
  const [results, setResults] = useState([]);
  const [saving, setSaving] = useState(false);
  const startRef = useRef(null);
  const secondsRef = useRef(0);
  const loadedRef = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode's dev-mode double effect run — without
    // this, every generation fires twice and double-bills the API.
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      try {
        const s = await getSession(slugs);
        if (s.entries.length === 0) {
          setSession(s);
          setPhase('empty');
          return;
        }

        // AI-generate a fresh problem for every chosen concept that has
        // none banked, before the session starts (the normal case).
        const needed = s.entries.filter((e) => !e.problem);
        if (needed.length > 0) {
          setPhase('generating');
          const results = await Promise.allSettled(
            needed.map((e) => generateProblemsForConcept(e.concept, { count: 1 }))
          );
          const failed = [];
          results.forEach((r, i) => {
            if (r.status === 'fulfilled' && r.value[0]) needed[i].problem = r.value[0];
            else failed.push(needed[i].concept.name);
          });
          s.entries = s.entries.filter((e) => e.problem);
          if (failed.length > 0) showToast('Generation failed for: ' + failed.join(', '));
        }

        setSession(s);
        if (s.entries.length === 0) setPhase('empty');
        else setPhase(s.entries[0].concept.state === 'forgotten' ? 'refresher' : 'attempt');
      } catch (err) {
        showToast('Failed to load session: ' + err.message);
        setPhase('empty');
      }
    })();
  }, [showToast]);

  // Timer runs during the attempt
  useEffect(() => {
    if (phase !== 'attempt') return;
    startRef.current = Date.now();
    setElapsed(0);
    const t = setInterval(() => setElapsed((Date.now() - startRef.current) / 1000), 1000);
    return () => clearInterval(t);
  }, [phase, index]);

  const entry = session?.entries[index];

  const reveal = (early) => {
    secondsRef.current = Math.round((Date.now() - startRef.current) / 1000);
    setRevealedEarly(early);
    setPhase('graded');
  };

  const finishAttempt = async (outcome, culpritSlug = null) => {
    setSaving(true);
    try {
      const changeList = await recordAttempt({
        problem: entry.problem,
        concept: entry.concept,
        outcome,
        culpritSlug,
        answerGiven: answer,
        seconds: secondsRef.current,
        revealedEarly,
      });
      setChanges(changeList);
      setResults((r) => [...r, { concept: entry.concept, outcome }]);
      setPhase('result');
    } catch (err) {
      showToast('Failed to save attempt: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    const i = index + 1;
    if (i >= session.entries.length) {
      setPhase('done');
      return;
    }
    setIndex(i);
    setAnswer('');
    setRevealedEarly(false);
    setChanges([]);
    setPhase(session.entries[i].concept.state === 'forgotten' ? 'refresher' : 'attempt');
  };

  const header = (title, right = null) => (
    <header className="header">
      <button className="btn-icon" onClick={() => navigate('problems')}>Exit</button>
      <h1 className="header-title">{title}</h1>
      {right || <div style={{ width: 36 }} />}
    </header>
  );

  if (phase === 'loading') {
    return <div className="screen">{header('Session')}<div className="center-message">Building session...</div></div>;
  }

  if (phase === 'generating') {
    return (
      <div className="screen">
        {header('Session')}
        <div className="review-done">
          <div className="generating-spinner" />
          <p className="review-done-text">Generating fresh problems with AI…</p>
          <p className="session-note">Usually a minute or two. Each problem is brand new — never seen before.</p>
        </div>
      </div>
    );
  }

  if (phase === 'empty') {
    return (
      <div className="screen">
        {header('Session')}
        <div className="review-done">
          <div className="review-done-icon">&#10003;</div>
          <p className="review-done-text">Nothing due right now.</p>
          <button className="btn btn-primary" onClick={() => navigate('problems')}>Back to Problems</button>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="screen">
        {header('Session Complete')}
        <div className="review-done">
          <div className="review-done-icon">&#10003;</div>
          <p className="review-done-text">You worked {results.length} problem{results.length === 1 ? '' : 's'}.</p>
          <div className="session-summary">
            {results.map((r, i) => (
              <div key={i} className={`session-summary-row outcome-${r.outcome}`}>
                <span>{r.concept.name}</span>
                <span className="session-summary-outcome">{r.outcome === 'clean' ? 'Clean pass' : r.outcome === 'weak' ? 'Weak pass' : 'Fail'}</span>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => navigate('problems')}>Back to Problems</button>
        </div>
      </div>
    );
  }

  const progress = <span className="review-counter">{index + 1} / {session.entries.length}</span>;

  // Refresher interstitial: forgotten concepts get a skim before the retry (spec §3).
  if (phase === 'refresher') {
    return (
      <div className="screen">
        {header('Refresher', progress)}
        <div className="problem-card">
          <div className="refresher-banner">Restoring a forgotten concept</div>
          <h2 className="refresher-title">{entry.concept.name}</h2>
          <p className="refresher-scope">{entry.concept.scope}</p>
          <p className="session-note">
            Skim your notes or one worked example (~10 min max). Then attempt a fresh problem —
            relearning is fast, a full lesson is overkill.
          </p>
          <button className="btn btn-primary btn-block" onClick={() => setPhase('attempt')}>
            I've refreshed — show the problem
          </button>
        </div>
      </div>
    );
  }

  const target = entry.problem.target_minutes;

  if (phase === 'attempt') {
    return (
      <div className="screen screen-problem">
        {header('Problem', progress)}
        <div className="problem-card">
          <Rich text={entry.problem.statement} className="problem-statement" />
          {entry.problem.diagram_svg && (
            <div className="problem-diagram" dangerouslySetInnerHTML={{ __html: entry.problem.diagram_svg }} />
          )}
          {entry.problem.diagram_asy && !entry.problem.diagram_svg && (
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

  if (phase === 'graded') {
    const verdict = timingVerdict(secondsRef.current, target);
    return (
      <div className="screen">
        {header('Check your work', progress)}
        <div className="problem-card problem-card-compact">
          <Rich text={entry.problem.statement} className="problem-statement" />
          {entry.problem.diagram_svg && (
            <div className="problem-diagram" dangerouslySetInnerHTML={{ __html: entry.problem.diagram_svg }} />
          )}
        </div>

        {answer && <div className="your-answer"><span>Your answer:</span> {answer}</div>}

        {entry.problem.answer && (
          <div className="reveal-block">
            <div className="reveal-label">Answer</div>
            <Rich text={entry.problem.answer} />
          </div>
        )}
        <div className="reveal-block">
          <div className="reveal-label">Rubric</div>
          <Rich text={entry.problem.rubric} />
        </div>

        <div className="timing-line">
          Took {fmtTime(secondsRef.current)} · target ~{target} min
          {verdict === 'over' && <span className="timing-over"> — over 1.5× target: grade no better than weak</span>}
          {revealedEarly && <span className="timing-over"> — revealed without submitting</span>}
        </div>

        <div className="grade-help">
          Clean = correct, unaided, in time. Weak = correct but slow / needed a hint / self-caught slip.
        </div>
        <div className="review-grades">
          <button className="btn btn-again" disabled={saving} onClick={() => setPhase('postmortem')}>Fail</button>
          <button className="btn btn-weak" disabled={saving} onClick={() => finishAttempt('weak')}>Weak pass</button>
          <button className="btn btn-easy" disabled={saving || verdict === 'over'} onClick={() => finishAttempt('clean')}>Clean pass</button>
        </div>
      </div>
    );
  }

  if (phase === 'postmortem') {
    // §6: one culprit per failure — the concept itself, or an encompassed skill.
    const options = [
      { slug: entry.concept.slug, name: entry.concept.name, hint: 'Misidentified the problem type or the whole approach' },
      ...(entry.concept.encompasses || []).map((enc) => {
        const c = session.concepts.find((x) => x.slug === enc.slug);
        return { slug: enc.slug, name: c?.name || enc.slug, hint: 'Setup was right, this component skill broke' };
      }),
    ];
    return (
      <div className="screen">
        {header('Post-mortem', progress)}
        <p className="session-note" style={{ marginBottom: 12 }}>
          Which single concept's absence caused the failure? It gets demoted and becomes due
          immediately; everything else is left alone.
        </p>
        <div className="postmortem-list">
          {options.map((o) => (
            <button key={o.slug} className="postmortem-option" disabled={saving} onClick={() => finishAttempt('fail', o.slug)}>
              <span className="postmortem-name">{o.name}</span>
              <span className="postmortem-hint">{o.hint}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-secondary btn-block" style={{ marginTop: 12 }} disabled={saving} onClick={() => setPhase('graded')}>
          Back
        </button>
      </div>
    );
  }

  // phase === 'result'
  return (
    <div className="screen">
      {header('Scheduled', progress)}
      <div className="result-card">
        <div className="reveal-label">This problem tested</div>
        <h2 className="refresher-title">{entry.concept.name}</h2>
        <ul className="changes-list">
          {changes.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </div>
      <button className="btn btn-primary btn-block" onClick={next}>
        {index + 1 >= session.entries.length ? 'Finish session' : 'Next problem'}
      </button>
    </div>
  );
}
