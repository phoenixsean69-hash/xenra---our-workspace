import { FolderOpenIcon } from "./Icons";

type Props = { onOpenProject: () => void };

export default function Welcome({ onOpenProject }: Props) {
  return (
    <main className="welcome-screen">
      <div className="welcome-card">
        <div className="welcome-brand">UW</div>
        <div>
          <p className="eyebrow">UNIVERSITY ENGINEERING WORKSPACE</p>
          <h1>Your code. Your projects. One workspace.</h1>
          <p className="welcome-copy">Version 0.1 starts with the essentials: a real project tree, code editor, local files, and an internal command terminal.</p>
          <button className="primary-action" onClick={onOpenProject}><FolderOpenIcon /> Open project folder</button>
        </div>
      </div>
      <div className="welcome-grid">
        <article><span>01</span><h3>Project-native</h3><p>Work directly against normal folders on your computer.</p></article>
        <article><span>02</span><h3>Internal editor</h3><p>No VS Code handoff. Files open and edit inside the application.</p></article>
        <article><span>03</span><h3>Ready to grow</h3><p>Branching, collaboration and submissions can be layered onto the same project model.</p></article>
      </div>
    </main>
  );
}
