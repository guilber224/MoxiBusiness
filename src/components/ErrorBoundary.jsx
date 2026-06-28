import { Component } from "react";
import { FONT } from "../theme.jsx";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[Moxi Business] Error no controlado:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "#0D1117", color: "white", fontFamily: FONT,
          gap: 16, padding: 24, textAlign: "center",
        }}>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Algo salió mal</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", maxWidth: 360, lineHeight: 1.6 }}>
            La aplicación encontró un error inesperado.<br />
            Por favor recarga la página. Si el problema persiste, contacta al soporte.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 8, background: "#111E7B", color: "white", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}
          >
            Recargar página
          </button>
          {this.state.error && (
            <details style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.25)", maxWidth: 500 }}>
              <summary style={{ cursor: "pointer" }}>Detalles técnicos</summary>
              <pre style={{ textAlign: "left", marginTop: 8, whiteSpace: "pre-wrap" }}>
                {this.state.error.toString()}
              </pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
