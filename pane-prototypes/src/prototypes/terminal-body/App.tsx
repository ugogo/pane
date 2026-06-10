import TerminalCalmApp from '../terminal-calm/App';
import './variant.css';

// Prototype 3 variant — secondary font (Geist sans) for BODY/prose; headings,
// data, metadata, chords and labels stay monospace. Reuses terminal-calm
// wholesale and only layers font overrides via the .tcv--body wrapper class.
export default function TerminalSansBodyApp() {
  return (
    <div className="tcv tcv--body">
      <TerminalCalmApp />
    </div>
  );
}
