"use client";

import { Component } from "react";

/**
 * Generic ErrorBoundary client component.
 *
 * Wraps children and catches render-time exceptions. Renders a fallback UI
 * that shows the actual error message + stack trace — much more useful than
 * Next.js's generic "Application error: a client-side exception has occurred".
 *
 * Usage: <ErrorBoundary fallback={(err) => <div>...</div>}>...</ErrorBoundary>
 *
 * If no fallback is provided, renders a default red error panel.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
    // Diagnostic: report to /api/_debug-error so it gets persisted to KV
    // and we can inspect from outside the browser. Fire-and-forget.
    try {
      fetch("/api/_debug-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: String(error?.message || error),
          stack: String(error?.stack || ""),
          componentStack: String(info?.componentStack || ""),
          path: typeof window !== "undefined" ? window.location.pathname : "",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }

  render() {
    if (this.state.error) {
      if (typeof this.props.fallback === "function") {
        return this.props.fallback(this.state.error, this.state.info);
      }
      if (this.props.silent) return null;
      return (
        <div style={{
          padding: 20, margin: 16,
          background: "#3b1212",
          border: "1px solid #ef4444",
          borderRadius: 10,
          color: "#fff",
          fontFamily: "ui-monospace, Menlo, monospace",
          fontSize: 12,
          maxHeight: "70vh",
          overflow: "auto",
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: "#fca5a5" }}>
            ⚠ Errore di rendering ({this.props.label || "componente"})
          </div>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
{String(this.state.error?.message || this.state.error)}
          </pre>
          {this.state.error?.stack && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", color: "#fca5a5" }}>Stack trace</summary>
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 8, fontSize: 11, color: "#fda4af" }}>{this.state.error.stack}</pre>
            </details>
          )}
          {this.state.info?.componentStack && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: "pointer", color: "#fca5a5" }}>Component stack</summary>
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 8, fontSize: 11, color: "#fda4af" }}>{this.state.info.componentStack}</pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
