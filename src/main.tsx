import {createRoot} from 'react-dom/client';
import {IconContext} from '@phosphor-icons/react';
import {MotionConfig} from 'motion/react';
import AppEntry from './AppEntry.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <IconContext.Provider value={{size: 18, weight: 'regular', strokeWidth: 1.75}}>
    <MotionConfig reducedMotion="user">
      <AppEntry />
    </MotionConfig>
  </IconContext.Provider>
);
