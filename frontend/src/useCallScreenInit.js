import { useEffect } from 'react';

export default function useCallScreenInit() {
  useEffect(() => {
    if (typeof window.initCallScreen === 'function') {
      window.initCallScreen();
    }
  }, []);
}
