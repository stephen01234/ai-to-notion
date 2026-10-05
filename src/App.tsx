import { useState } from "react";
import "./App.css";

import { convertToNotion } from "./converter/convert";
import { Preview } from "./components/Preview";

type OutputMode = "markdown" | "preview";

function App() {
  const [input, setInput] = useState("");
  const [outputMode, setOutputMode] =
    useState<OutputMode>("preview");

  const output = convertToNotion(input);

  async function copyOutput() {
    await navigator.clipboard.writeText(output);
  }

  function downloadMarkdown() {
    const blob = new Blob([output], {
      type: "text/markdown;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "notion-note.md";
    a.click();

    URL.revokeObjectURL(url);
  }

  return (
    <main className="app">
      <header className="header">
        <div>
          <h1>AI → Notion</h1>
          <p>
            Convert AI Markdown and LaTeX into
            Notion-friendly notes.
          </p>
        </div>
      </header>

      <div className="columns">
        <section className="panel">
          <div className="panelHeader">
            <h2>AI Input</h2>
          </div>

          <textarea
            className="editor"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="把 ChatGPT / Claude / Gemini 回答貼在這裡..."
          />
        </section>

        <section className="panel">
          <div className="panelHeader">
            <h2>Notion Output</h2>

            <div className="tabs">
              <button
                className={
                  outputMode === "markdown"
                    ? "tab active"
                    : "tab"
                }
                onClick={() =>
                  setOutputMode("markdown")
                }
              >
                Markdown
              </button>

              <button
                className={
                  outputMode === "preview"
                    ? "tab active"
                    : "tab"
                }
                onClick={() =>
                  setOutputMode("preview")
                }
              >
                Preview
              </button>
            </div>
          </div>

          {outputMode === "markdown" ? (
            <textarea
              className="editor"
              value={output}
              readOnly
            />
          ) : (
            <div className="previewContainer">
              {output ? (
                <Preview content={output} />
              ) : (
                <p className="empty">
                  預覽會顯示在這裡。
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="actions">
        <button onClick={copyOutput}>
          Copy Result
        </button>

        <button onClick={downloadMarkdown}>
          Download .md
        </button>
      </div>
    </main>
  );
}

export default App;