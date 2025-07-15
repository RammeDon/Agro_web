import React, { useState, useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
  useMap,
} from "react-leaflet";
import Papa from "papaparse";
import "./App.css";

function FitToData({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      const bounds = points.map((p) => [p.lat, p.lng]);
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [points, map]);
  return null;
}

export default function App() {
  const [files, setFiles] = useState([]); // uploaded file records
  const [metricsList, setMetricsList] = useState([]); // all metrics seen
  const [selectedMetric, setSelectedMetric] = useState("");
  const [gradientSettings, setGradientSettings] = useState({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempSettings, setTempSettings] = useState({});
  const fileInputRef = useRef();
  const folderInputRef = useRef();
  const nextFileId = useRef(1);

  // track paths/names loaded
  const loadedPaths = useRef(new Set());

  // rebuild metric dropdown AND ensure gradientSettings has entries
  useEffect(() => {
    const allMetrics = new Set();
    files.forEach((f) => f.metricsKeys.forEach((k) => allMetrics.add(k)));
    const arr = Array.from(allMetrics);
    setMetricsList(arr);
    // initialize any missing gradientSettings to {min:0,max:1}
    setGradientSettings((prev) => {
      const next = { ...prev };
      arr.forEach((m) => {
        if (!next[m]) next[m] = { min: 0, max: 1 };
      });
      return next;
    });
    if (!arr.includes(selectedMetric)) {
      setSelectedMetric(arr[0] || "");
    }
  }, [files]);

  // open settings modal, seed tempSettings
  const openSettings = () => {
    setTempSettings({ ...gradientSettings });
    setIsSettingsOpen(true);
  };

  // save settings
  const saveSettings = () => {
    setGradientSettings({ ...tempSettings });
    setIsSettingsOpen(false);
  };

  // remove file and free path/name
  const removeFile = (id) => {
    setFiles((prev) =>
      prev.filter((f) => {
        if (f.id === id) {
          loadedPaths.current.delete(f.path);
          loadedPaths.current.delete(f.name);
          return false;
        }
        return true;
      })
    );
  };

  // parse CSV text
  const parseCsv = ({ name, text, path }) => {
    Papa.parse(text, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: ({ data, meta }) => {
        const isVertical =
          meta.fields.includes("DataName") && meta.fields.includes("Mean");
        if (isVertical) {
          const lookup = {};
          data.forEach((r) => (lookup[r.DataName] = r.Mean));
          const lat = Number(lookup.latitude);
          const lng = Number(lookup.longitude);
          const metrics = Object.fromEntries(
            Object.entries(lookup).filter(
              ([k]) => k !== "latitude" && k !== "longitude"
            )
          );
          const metricsKeys = Object.keys(metrics);
          if (!isNaN(lat) && !isNaN(lng)) {
            setFiles((prev) => [
              ...prev,
              {
                id: nextFileId.current++,
                name,
                path,
                points: [{ lat, lng, metrics }],
                metricsKeys,
              },
            ]);
          }
        } else {
          const pts = data
            .map((row) => ({
              lat: Number(row.latitude ?? row.Latitude ?? row.lat),
              lng: Number(row.longitude ?? row.Longitude ?? row.lng),
              metrics: { NDVI: Number(row.NDVI ?? row.ndvi) },
            }))
            .filter(
              (p) => !isNaN(p.lat) && !isNaN(p.lng) && !isNaN(p.metrics.NDVI)
            );
          if (pts.length) {
            setFiles((prev) => [
              ...prev,
              {
                id: nextFileId.current++,
                name,
                path,
                points: pts,
                metricsKeys: ["NDVI"],
              },
            ]);
          }
        }
      },
      error: (err) => console.error("Parse error on", name, err),
    });
  };

  // handle one File object
  const handleFile = (file) => {
    const path = file.webkitRelativePath || file.name;
    const name = file.name;
    if (loadedPaths.current.has(path) || loadedPaths.current.has(name)) return;
    loadedPaths.current.add(path);
    loadedPaths.current.add(name);
    const reader = new FileReader();
    reader.onload = (e) => parseCsv({ name, text: e.target.result, path });
    reader.readAsText(file);
  };

  // ingest CSV FileList
  const ingestFiles = (list) =>
    Array.from(list)
      .filter((f) => f.name.toLowerCase().endsWith(".csv"))
      .forEach(handleFile);

  // UI handlers
  const onInputChange = (e) => ingestFiles(e.target.files);
  const onDrop = (e) => {
    e.preventDefault();
    ingestFiles(e.dataTransfer.files);
  };
  const onDragOver = (e) => e.preventDefault();
  const onClickUpload = () => fileInputRef.current.click();
  const onClickFolder = () => folderInputRef.current.click();
  const onFolderChange = (e) => ingestFiles(e.target.files);

  const allPoints = files.flatMap((f) => f.points);

  // normalize & map to color
  const getColor = (val) => {
    const { min, max } = gradientSettings[selectedMetric] || {
      min: 0,
      max: 1,
    };
    let norm = (val - min) / (max - min);
    norm = Math.max(0, Math.min(1, norm));
    const r = Math.round(255 * norm);
    const b = Math.round(255 * (1 - norm));
    return `rgb(${r},0,${b})`;
  };

  return (
    <div className="App">
      {/* Settings icon */}
      <button className="settings-btn" onClick={openSettings}>
        ⚙️
      </button>

      {/* Settings modal */}
      {isSettingsOpen && (
        <div className="modal-overlay">
          <div className="settings-modal">
            <h2>Gradient Settings</h2>
            {metricsList.map((m) => (
              <div key={m} className="setting-row">
                <label>{m}</label>
                <input
                  type="number"
                  step="any"
                  value={tempSettings[m]?.min ?? ""}
                  onChange={(e) =>
                    setTempSettings((prev) => ({
                      ...prev,
                      [m]: {
                        ...prev[m],
                        min: parseFloat(e.target.value),
                      },
                    }))
                  }
                />
                <input
                  type="number"
                  step="any"
                  value={tempSettings[m]?.max ?? ""}
                  onChange={(e) =>
                    setTempSettings((prev) => ({
                      ...prev,
                      [m]: {
                        ...prev[m],
                        max: parseFloat(e.target.value),
                      },
                    }))
                  }
                />
              </div>
            ))}
            <div className="settings-modal-buttons">
              <button onClick={saveSettings}>Save</button>
              <button onClick={() => setIsSettingsOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <h1>AgroGauge Map Viewer</h1>

      {/* Controls */}
      <div className="controls">
        <button className="folder-load-btn" onClick={onClickFolder}>
          Folder Load
        </button>
        <input
          ref={folderInputRef}
          type="file"
          webkitdirectory=""
          directory=""
          multiple
          style={{ display: "none" }}
          onChange={onFolderChange}
        />

        <div
          className="upload-area"
          onClick={onClickUpload}
          onDrop={onDrop}
          onDragOver={onDragOver}
        >
          <p>📂 Drag & drop CSVs here, or click to browse.</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".csv"
            onChange={onInputChange}
            style={{ display: "none" }}
          />
        </div>

        {metricsList.length > 0 && (
          <label>
            Show metric:&nbsp;
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
            >
              {metricsList.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* File menu */}
      <div className="file-menu">
        {files.map((f) => (
          <div key={f.id} className="file-menu-item">
            <span className="file-name">{f.name}</span>
            <button className="file-remove" onClick={() => removeFile(f.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* ← Gradient bar */}
      <div className="gradient-bar">
        <span className="gradient-label top">1</span>
        <div className="gradient" />
        <span className="gradient-label bottom">0</span>
      </div>

      {/* Map */}
      <MapContainer
        center={[0, 0]}
        zoom={2}
        style={{ height: "75vh", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <FitToData points={allPoints} />

        {allPoints.map((p, i) => {
          const val = p.metrics[selectedMetric];
          if (val == null) return null;
          const color = getColor(val);
          return (
            <CircleMarker
              key={i}
              center={[p.lat, p.lng]}
              radius={6}
              pathOptions={{ color, fillColor: color, fillOpacity: 1 }}
            >
              <Tooltip direction="top" offset={[0, -8]} sticky>
                {val}
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
