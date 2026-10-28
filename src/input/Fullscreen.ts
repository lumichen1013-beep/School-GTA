// 全螢幕切換按鈕 (含各瀏覽器前綴 API 與手機橫向鎖定)
const isFullscreenActive = (): boolean => !!(
  document.fullscreenElement ||
  (document as any).webkitFullscreenElement ||
  (document as any).mozFullScreenElement ||
  (document as any).msFullscreenElement
);

export function setupFullscreenButton(): void {
  const btnFullscreen = document.getElementById('btn-fullscreen');
  if (!btnFullscreen) return;

  const updateFullscreenState = () => {
    const isFs = isFullscreenActive();
    btnFullscreen.innerHTML = isFs ? '🗗 視窗' : '⛶ 全螢幕';
    btnFullscreen.setAttribute('title', isFs ? '切換視窗模式' : '切換全螢幕');
  };

  btnFullscreen.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      if (!isFullscreenActive()) {
        const docEl = document.documentElement as any;
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen();
        } else if (docEl.mozRequestFullScreen) {
          await docEl.mozRequestFullScreen();
        } else if (docEl.msRequestFullscreen) {
          await docEl.msRequestFullscreen();
        }

        try {
          const orientation = screen.orientation as any;
          if (orientation && orientation.lock) {
            await orientation.lock('landscape').catch(() => { });
          }
        } catch (_) { }
      } else {
        const doc = document as any;
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          await doc.mozCancelFullScreen();
        } else if (doc.msExitFullscreen) {
          await doc.msExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('全螢幕切換被拒絕或發生錯誤:', err);
    }
    updateFullscreenState();
  });

  document.addEventListener('fullscreenchange', updateFullscreenState);
  document.addEventListener('webkitfullscreenchange', updateFullscreenState);
  document.addEventListener('mozfullscreenchange', updateFullscreenState);
  document.addEventListener('MSFullscreenChange', updateFullscreenState);
}
