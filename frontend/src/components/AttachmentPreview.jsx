import React, { useState, forwardRef, useImperativeHandle } from 'react';

function AttachmentPreview(props, ref) {
  const [items, setItems] = useState([]);

  const addFiles = (fileList) => {
    const arr = Array.from(fileList).map(f => ({
      file: f,
      url: URL.createObjectURL(f),
      progress: 0,
      failed: false,
      retry: null
    }));
    setItems(prev => {
      const next = [...prev, ...arr];
      if (props.onFilesChange) props.onFilesChange(next.map(i => i.file));
      return next;
    });
  };

  const handleChange = (e) => {
    addFiles(e.target.files);
    e.target.value = '';
  };

  const remove = (idx) => {
    setItems(prev => {
      const next = prev.filter((_, i) => i !== idx);
      if (props.onFilesChange) props.onFilesChange(next.map(i => i.file));
      return next;
    });
  };

  useImperativeHandle(ref, () => ({
    getFiles: () => items.map(i => i.file),
    clear: () => setItems([]),
    updateProgress: (idx, percent) => {
      setItems(prev => prev.map((it, i) => i === idx ? { ...it, progress: percent } : it));
    },
    markFailed: (idx, retryFn) => {
      setItems(prev => prev.map((it, i) => i === idx ? { ...it, failed: true, retry: retryFn } : it));
    }
  }));

  return (
    <div>
      <input data-testid="file-input" type="file" multiple onChange={handleChange} />
      {items.length > 0 && (
        <div id="attachmentPreview">
          {items.map((item, idx) => (
            <div key={idx} className={`preview-item${item.failed ? ' upload-failed' : ''}`}>\
              {item.file.type.startsWith('image/') ? (
                <img src={item.url} alt={item.file.name} />
              ) : (
                <span>{item.file.name}</span>
              )}
              <span className="remove-badge material-icons" onClick={() => remove(idx)}>close</span>
              <div className="upload-progress"><div className="bar" style={{ width: item.progress + '%' }}></div></div>
              {item.failed && (
                <button className="retry-btn" onClick={() => item.retry && item.retry()}>↻</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default forwardRef(AttachmentPreview);
