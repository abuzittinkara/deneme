export let pingInterval = null;

function updateCellBars(ping) {
  const cellBar1 = document.getElementById('cellBar1');
  const cellBar2 = document.getElementById('cellBar2');
  const cellBar3 = document.getElementById('cellBar3');
  const cellBar4 = document.getElementById('cellBar4');
  let barsActive = 0;
  if (ping >= 1) {
    if (ping < 80) barsActive = 4;
    else if (ping < 150) barsActive = 3;
    else if (ping < 300) barsActive = 2;
    else barsActive = 1;
  } else {
    barsActive = 0;
  }
  [cellBar1, cellBar2, cellBar3, cellBar4].forEach(bar => bar && bar.classList.remove('active'));
  if (barsActive >= 1 && cellBar1) cellBar1.classList.add('active');
  if (barsActive >= 2 && cellBar2) cellBar2.classList.add('active');
  if (barsActive >= 3 && cellBar3) cellBar3.classList.add('active');
  if (barsActive >= 4 && cellBar4) cellBar4.classList.add('active');
}

export function updateStatusPanel(ping) {
  const rssIcon = document.getElementById('rssIcon');
  const statusMessage = document.getElementById('statusMessage');
  const channelGroupInfo = document.getElementById('channelGroupInfo');
  let color = '#2dbf2d';
  if (ping >= 80) {
    color = '#ff0000';
  } else if (ping >= 60) {
    color = '#ffcc00';
  }
  if (rssIcon) rssIcon.style.color = color;
  if (statusMessage) statusMessage.style.color = color;
  if (channelGroupInfo) {
    const channelName = window.activeVoiceChannelName || '';
    const groupTitleEl = document.getElementById('groupTitle');
    const groupName = groupTitleEl ? groupTitleEl.textContent : '';
    channelGroupInfo.textContent = channelName + ' / ' + groupName;
    channelGroupInfo.style.color = '#aaa';
  }
}

export function startPingInterval(socket) {
  const pingValueSpan = document.getElementById('pingValue');
  if (pingInterval) clearInterval(pingInterval);
  pingInterval = setInterval(() => {
    let pingMs = 0;
    if (socket && socket.io && socket.io.engine && socket.io.engine.lastPingTimestamp) {
      const now = Date.now();
      pingMs = now - socket.io.engine.lastPingTimestamp;
      if (pingValueSpan) pingValueSpan.textContent = pingMs + ' ms';
    } else {
      if (pingValueSpan) pingValueSpan.textContent = '-- ms';
    }
    updateStatusPanel(pingMs);
    updateCellBars(pingMs);
  }, 1000);
}

export function stopPingInterval() {
  const pingValueSpan = document.getElementById('pingValue');
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  if (pingValueSpan) pingValueSpan.textContent = '-- ms';
  updateCellBars(0);
}