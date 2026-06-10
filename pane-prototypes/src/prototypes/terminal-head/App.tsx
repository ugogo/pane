import TerminalCalmApp from '../terminal-calm/App';
import './variant.css';

// Prototype 3 variant — secondary font (Geist sans) for HEADINGS/titles only;
// body copy, data, metadata and chords stay monospace. Reuses terminal-calm
// wholesale and only layers font overrides via the .tcv--head wrapper class.
export default function TerminalSansHeadApp() {
  return (
    <div className="tcv tcv--head">
      <TerminalCalmApp />
    </div>
  );
}
