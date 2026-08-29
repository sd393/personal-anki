import { useState } from 'react';
import { createProblem, updateProblem } from '../lib/problems-api.js';
import { CONCEPTS } from '../data/concept-graph.js';
import Rich from './Rich.jsx';

const STYLES = ['compute', 'derive', 'prove', 'diagnose', 'implement', 'estimate'];

export default function ProblemForm({ conceptSlug, problem, navigate, showToast }) {
  const isEdit = !!problem;
  const [slug, setSlug] = useState(problem?.concept_slug || conceptSlug || CONCEPTS[0].slug);
  const [statement, setStatement] = useState(problem?.statement || '');
  const [answer, setAnswer] = useState(problem?.answer || '');
  const [rubric, setRubric] = useState(problem?.rubric || '');
  const [diagramAsy, setDiagramAsy] = useState(problem?.diagram_asy || '');
  const [diagramSvg, setDiagramSvg] = useState(problem?.diagram_svg || '');
  const [style, setStyle] = useState(problem?.style || '');
  const [difficulty, setDifficulty] = useState(problem?.difficulty || 1);
  const [targetMinutes, setTargetMinutes] = useState(problem?.target_minutes || 10);
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!statement.trim() || !rubric.trim()) return;
    setLoading(true);
    const fields = {
      concept_slug: slug,
      statement: statement.trim(),
      answer: answer.trim() || null,
      rubric: rubric.trim(),
      diagram_asy: diagramAsy.trim() || null,
      diagram_svg: diagramSvg.trim() || null,
      style: style || null,
      difficulty: Number(difficulty),
      target_minutes: Number(targetMinutes) || 10,
    };
    try {
      if (isEdit) {
        await updateProblem(problem.id, fields);
        showToast('Problem updated');
        navigate('problems');
      } else {
        await createProblem(fields);
        showToast('Problem added');
        setStatement(''); setAnswer(''); setRubric('');
        setDiagramAsy(''); setDiagramSvg('');
      }
    } catch (err) {
      showToast('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen">
      <header className="header">
        <button className="btn-icon" onClick={() => navigate('problems')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h1 className="header-title">{isEdit ? 'Edit Problem' : 'Add Problem'}</h1>
        <button className="btn btn-sm btn-secondary" onClick={() => setPreview(!preview)}>
          {preview ? 'Edit' : 'Preview'}
        </button>
      </header>

      {preview ? (
        <div>
          <div className="problem-card">
            <Rich text={statement || '*No statement yet*'} className="problem-statement" />
            {diagramSvg && <div className="problem-diagram" dangerouslySetInnerHTML={{ __html: diagramSvg }} />}
          </div>
          {answer && (
            <div className="reveal-block"><div className="reveal-label">Answer</div><Rich text={answer} /></div>
          )}
          {rubric && (
            <div className="reveal-block"><div className="reveal-label">Rubric</div><Rich text={rubric} /></div>
          )}
        </div>
      ) : (
        <form className="card-form" onSubmit={handleSubmit}>
          <label className="form-label">
            Concept
            <select className="form-input" value={slug} onChange={(e) => setSlug(e.target.value)}>
              {CONCEPTS.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name} ({c.slug})</option>
              ))}
            </select>
          </label>

          <div className="form-row">
            <label className="form-label" style={{ flex: 1 }}>
              Style
              <select className="form-input" value={style} onChange={(e) => setStyle(e.target.value)}>
                <option value="">—</option>
                {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="form-label" style={{ flex: 1 }}>
              Difficulty
              <select className="form-input" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value={1}>1 — standard</option>
                <option value={2}>2 — escalated</option>
              </select>
            </label>
            <label className="form-label" style={{ flex: 1 }}>
              Target (min)
              <input className="form-input" type="number" min="1" value={targetMinutes} onChange={(e) => setTargetMinutes(e.target.value)} />
            </label>
          </div>

          <label className="form-label">
            Statement — markdown, $latex$, $$display$$, ```code fences```
            <textarea className="form-textarea form-mono" value={statement} onChange={(e) => setStatement(e.target.value)} rows={6} placeholder="Never name the concept being tested." />
          </label>

          <label className="form-label">
            Answer (short form, shown on reveal)
            <textarea className="form-textarea form-mono" value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} />
          </label>

          <label className="form-label">
            Rubric — key steps, expected form, common wrong turns
            <textarea className="form-textarea form-mono" value={rubric} onChange={(e) => setRubric(e.target.value)} rows={6} />
          </label>

          <label className="form-label">
            Diagram — Asymptote source (compiled by scripts/compile-diagrams.mjs)
            <textarea className="form-textarea form-mono" value={diagramAsy} onChange={(e) => setDiagramAsy(e.target.value)} rows={4} placeholder="size(200); draw(circle((0,0),1));" />
          </label>

          <label className="form-label">
            Diagram SVG (what actually renders — paste, or leave empty and run the compile script)
            <textarea className="form-textarea form-mono" value={diagramSvg} onChange={(e) => setDiagramSvg(e.target.value)} rows={3} placeholder="<svg ...>...</svg>" />
          </label>

          <button className="btn btn-primary" type="submit" disabled={loading || !statement.trim() || !rubric.trim()}>
            {isEdit ? 'Save' : 'Add Problem'}
          </button>
        </form>
      )}
    </div>
  );
}
