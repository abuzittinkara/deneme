import React from 'react';

export default function LogoutConfirmModal() {
  return (
    <div id="logoutConfirmModal" className="modal">
      <div className="modal-content">
        <h2>Are you sure you want to log out?</h2>
        <div className="modal-buttons">
          <button id="confirmLogoutBtn" className="btn primary">Yes</button>
          <button id="cancelLogoutBtn" className="btn secondary">No</button>
        </div>
      </div>
    </div>
  );
}
