import { useState, useEffect } from 'react';
import { getHistory } from '../lib/problems-api.js';
import { CONCEPTS_BY_SLUG } from '../data/concept-graph.js';
import Rich from './Rich.jsx';

const PAGE = 50;

const OUTCOME_LABEL = { clean: 'Clean pass', weak: 'Weak pass', fail: 'Fail' };

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Every past attempt, newest first, expandable to the full problem. */
export default function History({ navigate, showToast }) {
  const [attempts, setAttempts] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const load = async (offset = 0) => {
    try {
      const rows = await getHistory(PAGE, offset);
      setAttempts((prev) => (offset === 0 ? rows : [...prev, ...rows]));
      setHasMore(rows.length === PAGE);
    } catch (err) {
      showToast('Error loading history: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(0); }, []);

  return (
    <div className="screen">
      <header className="header">
        <button className="btn-icon" onClick={() => navigate('problems')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h1 className="header-title">History</h1>
        <div style={{ width: 36 }} />
      </header>

      {loading ? (
        <div className="center-message">Loading...</div>
      ) : attempts.length === 0 ? (
        <div className="center-message">No attempts yet — work a session first.</div>
      ) : (
        <>
          <div className="history-list">
            {attempts.map((a) => {
              const concept = CONCEPTS_BY_SLUG[a.concept_slug];
              const open = expanded === a.id;
              return (
                <div key={a.id} className={`history-row outcome-${a.outcome}`}>
                  <div className="history-row-main" onClick={() => setExpanded(open ? null : a.id)}>
                    <span className={`history-outcome history-outcome-${a.outcome}`}>{OUTCOME_LABEL[a.outcome] || a.outcome}</span>
                    <span className="history-concept">{concept?.name || a.concept_slug}</span>
                    <span className="history-meta">
                      {a.mode === 'practice' && <span className="tag" style={{ marginRight: 6 }}>practice</span>}
                      {a.seconds ? `${Math.round(a.seconds / 60)}m · ` : ''}{fmtDate(a.created_at)}
                    </span>
                  </div>
                  {open && (
                    <div className="history-detail">
                      {a.problems ? (
                        <>
                          <Rich text={a.problems.statement} className="problem-statement" />
                          {a.problems.diagram_svg && (
                            <div className="problem-diagram" dangerouslySetInnerHTML={{ __html: a.problems.diagram_svg }} />
                          )}
                          {a.answer_given && <div className="your-answer" style={{ marginTop: 12 }}><span>Your answer:</span> {a.answer_given}</div>}
                          {a.problems.answer && (
                            <div className="reveal-block"><div className="reveal-label">Answer</div><Rich text={a.problems.answer} /></div>
                          )}
                          <div className="reveal-block"><div className="reveal-label">Rubric</div><Rich text={a.problems.rubric} /></div>
                        </>
                      ) : (
                        <p className="session-note">Problem was deleted.</p>
                      )}
                      {a.culprit_slug && (
                        <p className="session-note">
                          Post-mortem culprit: {CONCEPTS_BY_SLUG[a.culprit_slug]?.name || a.culprit_slug}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {hasMore && (
            <button className="btn btn-secondary btn-block" style={{ marginTop: 12 }} onClick={() => load(attempts.length)}>
              Load more
            </button>
          )}
        </>
      )}
    </div>
  );
}
