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
  const [files, setFiles] = useState([]);
  const [metricsList, setMetricsList] = useState([]);
  const [selectedMetric, setSelectedMetric] = useState("");
  const [gradientSettings, setGradientSettings] = useState({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempSettings, setTempSettings] = useState({});
  const [pinSizeKey, setPinSizeKey] = useState("medium"); // <— new
  const fileInputRef = useRef();
  const folderInputRef = useRef();
  const nextFileId = useRef(1);
  const loadedPaths = useRef(new Set());

  // mapping from key → radius
  const pinSizes = {
    small: 2,
    medium: 4,
    large: 6,
  };

  useEffect(() => {
    const all = new Set();
    files.forEach((f) => f.metricsKeys.forEach((k) => all.add(k)));
    const arr = Array.from(all);
    setMetricsList(arr);
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

  const openSettings = () => {
    setTempSettings({ ...gradientSettings });
    setIsSettingsOpen(true);
  };
  const saveSettings = () => {
    setGradientSettings({ ...tempSettings });
    setIsSettingsOpen(false);
  };

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

  const ingestFiles = (list) =>
    Array.from(list)
      .filter((f) => f.name.toLowerCase().endsWith(".csv"))
      .forEach(handleFile);

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

  const getColor = (val) => {
    const { min, max } = gradientSettings[selectedMetric] || { min: 0, max: 1 };
    let norm = (val - min) / (max - min);
    norm = Math.max(0, Math.min(1, norm));
    const r = Math.round(255 * norm);
    const b = Math.round(255 * (1 - norm));
    return `rgb(${r},0,${b})`;
  };

  return (
    <div className="App">
      {/* Settings modal */}
      {isSettingsOpen && (
        <div className="modal-overlay">
          <div className="settings-modal">
            <h4>Version 1.2</h4>
            <h2>Gradient Settings</h2>
            {metricsList.map((m) => (
              <div key={m} className="setting-row">
                <label>{m}</label>
                <input
                  type="number"
                  step="any"
                  value={tempSettings[m]?.min ?? ""}
                  onChange={(e) =>
                    setTempSettings((p) => ({
                      ...p,
                      [m]: { ...p[m], min: parseFloat(e.target.value) },
                    }))
                  }
                />
                <input
                  type="number"
                  step="any"
                  value={tempSettings[m]?.max ?? ""}
                  onChange={(e) =>
                    setTempSettings((p) => ({
                      ...p,
                      [m]: { ...p[m], max: parseFloat(e.target.value) },
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

      {/* ─── Top Bar ─── */}
      <div className="top-bar">
        {/* Left side */}
        <div className="top-bar-left">
          <button
            className="settings-btn"
            onClick={openSettings}
            title="Settings"
          >
            ⚙️
          </button>
          <h1 className="title-text">AgroGauge Map Viewer</h1>
        </div>

        {/* Center: Folder, Upload, Metric & Pin-size */}
        <div className="top-bar-center">
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

          {/* metric selector */}
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

          {/* new pin-size selector */}
          <label>
            Pin size:&nbsp;
            <select
              value={pinSizeKey}
              onChange={(e) => setPinSizeKey(e.target.value)}
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </label>
        </div>

        {/* Right side */}
        <div className="top-bar-right">
          <details className="file-menu">
            <summary>Uploaded Files</summary>
            <ul>
              {files.map((f) => (
                <li key={f.id}>
                  <span className="file-name">{f.name}</span>
                  <button
                    className="file-remove"
                    onClick={() => removeFile(f.id)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>

      {/* Gradient bar */}
      <div className="gradient-bar">
        <span className="gradient-label top">
          {gradientSettings[selectedMetric]?.max ?? ""}
        </span>
        <div className="gradient" />
        <span className="gradient-label bottom">
          {gradientSettings[selectedMetric]?.min ?? ""}
        </span>
      </div>

      {/* Map */}
      <MapContainer
        center={[0, 0]}
        zoom={2}
        style={{ height: "90vh", width: "100%" }}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution=""
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
              radius={pinSizes[pinSizeKey]}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 1,
              }}
            >
              <Tooltip direction="top" offset={[0, -8]} sticky>
                {val.toFixed(2)}
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
