import { useEffect } from 'react';
import { initCallScreen } from '../../public/script.js';

export default function useCallScreenInit() {
  useEffect(() => {
    initCallScreen();
  }, []);
}
