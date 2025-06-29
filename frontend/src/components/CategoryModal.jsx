import React from 'react';

export default function CategoryModal() {
  return (
    <div id="categoryModal" className="modal">
      <div className="modal-content">
        <h2>Kategori Oluştur</h2>
        <input type="text" id="modalCategoryName" className="input-text" placeholder="Kategori Adı" />
        <div className="modal-buttons">
          <button id="modalCreateCategoryBtn" className="btn primary">Oluştur</button>
          <button id="modalCloseCategoryBtn" className="btn secondary">Kapat</button>
        </div>
      </div>
    </div>
  );
}
