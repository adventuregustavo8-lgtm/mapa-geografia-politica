import React, { useState } from "react";

// SVG-CSV Map Editor
// Single-file React component. Drop into a React app or preview in the canvas.
// Features:
// - Upload an SVG file and a CSV file
// - CSV must contain columns: id, label (optional), value, region
// - For each <path ...> in the SVG the component will:
//    • insert attributes long-name="<inkscape:label or CSV label>" value="<from CSV or 0>" region="<from CSV or 0>"
//    • attributes are written in separate lines and placed before the id attribute in the tag (if id exists)
// - Download the edited SVG as a file

export default function SvgCsvMapEditor() {
  const [svgText, setSvgText] = useState("");
  const [csvText, setCsvText] = useState("");
  const [status, setStatus] = useState("");
  const [downloadUrl, setDownloadUrl] = useState(null);

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file, "utf-8");
    });
  }

  // Basic CSV parser that supports quoted fields and commas inside quotes
  function parseCSV(text) {
    const lines = text.replace(/\r\n/g, "\n").split("\n").filter(l => l.trim() !== "");
    if (lines.length === 0) return [];
    const rows = [];
    const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      // pad values if necessary
      while (values.length < headers.length) values.push("");
      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = values[j];
      }
      rows.push(obj);
    }
    return rows;
  }

  function parseCSVLine(line) {
    const result = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // escaped quote
          cur += '"';
          i++; // skip next
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        result.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    result.push(cur);
    return result;
  }

  function buildLookup(rows) {
    const byId = {};
    const byLabel = {};
    for (const r of rows) {
      const id = (r.id || "").toString().trim();
      const label = (r.label || "").toString().trim();
      const value = (r.value || "0").toString().trim();
      const region = (r.region || "0").toString().trim();
      if (id) byId[id] = { value, region, label };
      if (label) byLabel[label] = { value, region, id };
    }
    return { byId, byLabel };
  }

  function sanitizeAttrValue(v) {
    if (v === undefined || v === null) return "";
    // escape double quotes
    return v.toString().replace(/"/g, '&quot;');
  }

  function editSvg(svgStr, lookup) {
    // We will operate on the text to preserve attribute ordering and produce attributes on separate lines
    // Use regex to find <path ...> tags (self-closing or not)
    const pathRegex = /<path\b[^>]*>/gi;
    const modified = svgStr.replace(pathRegex, (tag) => {
      // Remove any previously added attributes to avoid duplication
      let clean = tag
        .replace(/\s+long-name="[^"]*"/gi, "")
        .replace(/\s+value="[^"]*"/gi, "")
        .replace(/\s+region="[^"]*"/gi, "");

      // Extract inkscape:label
      const labelMatch = clean.match(/inkscape:label="([^"]*)"/i);
      const inkscapeLabel = labelMatch ? labelMatch[1] : null;

      // Extract id
      const idMatch = clean.match(/\sid="([^"]*)"/i);
      const elemId = idMatch ? idMatch[1] : null;

      // Determine values from CSV lookup
      let value = "0";
      let region = "0";
      let longName = inkscapeLabel || "None";

      if (elemId && lookup.byId[elemId]) {
        value = lookup.byId[elemId].value || "0";
        region = lookup.byId[elemId].region || "0";
        // prefer CSV label for long-name if provided
        if (lookup.byId[elemId].label) longName = lookup.byId[elemId].label;
      } else if (inkscapeLabel && lookup.byLabel[inkscapeLabel]) {
        value = lookup.byLabel[inkscapeLabel].value || "0";
        region = lookup.byLabel[inkscapeLabel].region || "0";
        if (lookup.byLabel[inkscapeLabel].id) {
          // optionally could set id, but we won't overwrite id attribute
        }
      }

      // Prepare insertion string with newlines and indentation
      // detect indentation from the tag (if tag starts with '<path\n    attr...')
      const indent = "    "; // 4 spaces
      const newlineAttrs = `\n${indent}long-name="${sanitizeAttrValue(longName)}"\n${indent}value="${sanitizeAttrValue(value)}"\n${indent}region="${sanitizeAttrValue(region)}"`;

      // Insert before the id attribute if present
      if (idMatch) {
        // insert before the first occurrence of id=""
        const replaced = clean.replace(/(\s+id=")/i, `${newlineAttrs}$1`);
        return replaced;
      } else {
        // no id attribute, insert before closing >
        // but keep the tag form (<path ...>) so remove final '>' and add attrs then '>'
        const withoutClose = clean.replace(/>\s*$/, "");
        return withoutClose + newlineAttrs + ">";
      }
    });

    return modified;
  }

  async function handleFiles(svgFile, csvFile) {
    try {
      setStatus("Lendo arquivos...");
      const [svgData, csvData] = await Promise.all([readFileAsText(svgFile), readFileAsText(csvFile)]);
      setSvgText(svgData);
      setCsvText(csvData);

      setStatus("Parseando CSV...");
      const rows = parseCSV(csvData);
      const lookup = buildLookup(rows);

      setStatus("Editando SVG — inserindo atributos...");
      const edited = editSvg(svgData, lookup);

      // Create downloadable blob
      const blob = new Blob([edited], { type: "image/svg+xml;charset=utf-8" });
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setStatus("Pronto — arquivo editado gerado.");
    } catch (err) {
      console.error(err);
      setStatus("Erro: " + err.message);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">SVG ← CSV — Map Editor</h1>

      <p className="mb-4 text-sm text-gray-700">Faça upload de um arquivo <code>.svg</code> e um <code>.csv</code> com as colunas <strong>id,label,value,region</strong>. O site editará cada <code>&lt;path&gt;</code> inserindo os atributos <code>long-name</code>, <code>value</code> e <code>region</code>, usando <code>inkscape:label</code> ou o CSV para nome e usando o CSV para os valores.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block font-medium">SVG (.svg)</label>
          <input
            type="file"
            accept=".svg"
            className="mt-2"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                const svgFile = e.target.files[0];
                // if CSV already selected, wait for user to press process button, or we could auto-run
                const csvEl = document.getElementById("csvInput");
                const csvFile = csvEl && csvEl.files && csvEl.files[0];
                if (csvFile) handleFiles(svgFile, csvFile);
                else readFileAsText(svgFile).then(setSvgText);
              }
            }}
          />
        </div>

        <div>
          <label className="block font-medium">CSV (.csv)</label>
          <input
            id="csvInput"
            type="file"
            accept=".csv,text/csv"
            className="mt-2"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                const csvFile = e.target.files[0];
                const svgEl = document.querySelector('input[type="file"][accept=".svg"]');
                const svgFile = svgEl && svgEl.files && svgEl.files[0];
                if (svgFile) handleFiles(svgFile, csvFile);
                else readFileAsText(csvFile).then(setCsvText);
              }
            }}
          />
        </div>
      </div>

      <div className="flex gap-2 items-center mb-4">
        <button
          className="px-4 py-2 bg-sky-600 text-white rounded shadow"
          onClick={async () => {
            // If user pressed button, try to read both inputs and run
            const svgEl = document.querySelector('input[type="file"][accept=".svg"]');
            const csvEl = document.getElementById("csvInput");
            if (!svgEl || !svgEl.files || !svgEl.files[0]) return setStatus("Selecione o SVG primeiro");
            if (!csvEl || !csvEl.files || !csvEl.files[0]) return setStatus("Selecione o CSV primeiro");
            await handleFiles(svgEl.files[0], csvEl.files[0]);
          }}
        >
          Gerar mapa editado
        </button>

        {downloadUrl && (
          <a
            href={downloadUrl}
            download={"mapa_editado.svg"}
            className="px-4 py-2 bg-green-600 text-white rounded shadow"
          >
            Baixar mapa editado
          </a>
        )}

        <button
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded"
          onClick={() => {
            setSvgText("");
            setCsvText("");
            setDownloadUrl(null);
            setStatus("");
            const svgEl = document.querySelector('input[type="file"][accept=".svg"]');
            const csvEl = document.getElementById("csvInput");
            if (svgEl) svgEl.value = null;
            if (csvEl) csvEl.value = null;
          }}
        >
          Limpar
        </button>
      </div>

      <div className="mb-4">
        <div className="text-sm text-gray-600">Status: {status}</div>
      </div>

      <details className="bg-gray-50 p-3 rounded">
        <summary className="cursor-pointer">Visualizar SVG (entrada)</summary>
        <pre className="max-h-64 overflow-auto mt-2 text-xs whitespace-pre-wrap">{svgText.substring(0, 20000)}</pre>
      </details>

      <details className="bg-gray-50 p-3 rounded mt-3">
        <summary className="cursor-pointer">Visualizar CSV (entrada)</summary>
        <pre className="max-h-64 overflow-auto mt-2 text-xs whitespace-pre-wrap">{csvText.substring(0, 20000)}</pre>
      </details>

      <p className="text-xs text-gray-500 mt-3">Dica: os cabeçalhos do CSV são case-insensitive. Se quiser que eu gere também o atributo <code>id</code> com base no CSV, posso adicionar essa opção.</p>
    </div>
  );
}
