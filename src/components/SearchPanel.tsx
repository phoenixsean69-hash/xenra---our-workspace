import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "../types";
import { searchProject } from "../services/backend";

type Props = {
  rootPath: string | null;
  onOpenResult: (result: SearchResult) => void;
};

export default function SearchPanel({ rootPath, onOpenResult }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener("xenra:focus-search", focus);
    return () => window.removeEventListener("xenra:focus-search", focus);
  }, []);

  useEffect(() => {
    setResults([]);
    setMessage("");
  }, [rootPath]);

  const runSearch = async () => {
    if (!rootPath) {
      setMessage("Open a folder first.");
      return;
    }

    const value = query.trim();
    if (!value) {
      setResults([]);
      setMessage("");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const found = await searchProject(rootPath, value);
      setResults(found);
      setMessage(found.length ? `${found.length} result${found.length === 1 ? "" : "s"}` : "No results");
    } catch (error) {
      setResults([]);
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="side-panel search-panel">
      <div className="side-panel-heading">SEARCH</div>
      <form
        className="search-form"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch();
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          spellCheck={false}
          disabled={!rootPath}
        />
        <button type="submit" disabled={!rootPath || busy}>{busy ? "..." : "↵"}</button>
      </form>

      <div className="side-panel-meta">{message}</div>

      <div className="search-results">
        {results.map((result, index) => (
          <button
            className="search-result"
            type="button"
            key={`${result.path}:${result.line}:${result.column}:${index}`}
            onClick={() => onOpenResult(result)}
            title={`${result.relativePath}:${result.line}:${result.column}`}
          >
            <span className="search-result-path">{result.relativePath}</span>
            <span className="search-result-location">{result.line}:{result.column}</span>
            <span className="search-result-preview">{result.preview || " "}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
