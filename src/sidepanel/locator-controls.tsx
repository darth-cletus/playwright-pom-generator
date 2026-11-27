import {useId, useState} from 'react';
import {parseSettings, recommendedCandidate, selectedCandidate, type LocatorSettings} from '../core/locator';
import type {ElementModel} from '../core/model';
import {pythonLocator} from '../core/python';

export function Settings({settings, onSave}: {settings: LocatorSettings; onSave: (settings: LocatorSettings) => Promise<void>}) {
  const [attributes, setAttributes] = useState(settings.testAttributes.join(', '));
  const [playwright, setPlaywright] = useState(settings.playwrightTestAttribute);
  const [status, setStatus] = useState('');
  return <details>
    <summary>Locator settings</summary>
    <form onSubmit={async event => {
      event.preventDefault();
      try {
        await onSave(parseSettings(attributes, playwright));
        setStatus('Settings saved. Scan again to apply them.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    }}>
      <label>Recognized test ID attributes in priority order
        <input type="text" value={attributes} onChange={event => setAttributes(event.target.value)}/>
      </label>
      <label>Test ID attribute configured in your Playwright project
        <input type="text" value={playwright} onChange={event => setPlaywright(event.target.value)} required/>
      </label>
      <button type="submit">Save locator settings</button>
      <small role="status">{status}</small>
    </form>
  </details>;
}

const validationMethods = {
  'dom-css': 'Exact DOM CSS match',
  'semantic-approximation': 'Browser approximation',
  playwright: 'Playwright runtime',
  none: 'Unvalidated',
};

const validationStatuses = {
  'unique-target': 'Unique target',
  ambiguous: 'Ambiguous',
  'no-match': 'No match',
  'wrong-target': 'Wrong target',
  unvalidated: 'Unvalidated',
  error: 'Validation error',
};

export function LocatorControls({element, onChoice}: {element: ElementModel; onChoice: (choice: string | null) => void}) {
  const id = useId();
  const recommended = recommendedCandidate(element.candidates);
  const active = selectedCandidate(element);
  return <>
    <label htmlFor={id}>Locator</label>
    <select id={id} value={element.choice ?? ''} onChange={event => onChoice(event.target.value || null)}>
      <option value="">Automatic{recommended ? ` · ${recommended.basis}` : ' · No unique candidate'}</option>
      {element.candidates.map(candidate => <option key={candidate.id} value={candidate.id}>
        {candidate.basis} · {candidate.locator.strategy} · {candidate.score}/100 · {validationStatuses[candidate.validation.status]}
      </option>)}
    </select>
    {active && <>
      <small><code>{pythonLocator(active.locator)}</code></small>
      <small>{active.locator.strategy} · {active.score}/100 · {validationStatuses[active.validation.status]}
        {' · '}{active.validation.count ?? 'Unknown'} matches · {validationMethods[active.validation.method]}</small>
      <details>
        <summary>Locator details</summary>
        <ul>{[...active.explanations, ...active.warnings].map(line => <li key={line}>{line}</li>)}</ul>
      </details>
    </>}
  </>;
}
