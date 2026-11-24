import { elliottEngine } from './elliottEngine.js'
import { ictEngine } from './ictEngine.js'
import { harmonicEngine } from './harmonicEngine.js'
import { classicalEngine } from './classicalEngine.js'
import { gannEngine } from './gannEngine.js'
export const schools = {
  ELLIOTT: { name: 'Elliott Wave', arabic: 'إليوت', engine: elliottEngine },
  ICT: { name: 'Smart Money', arabic: 'ICT', engine: ictEngine },
  HARMONIC: { name: 'Harmonics', arabic: 'هارمونيك', engine: harmonicEngine },
  CLASSICAL: { name: 'Classical', arabic: 'كلاسيك', engine: classicalEngine },
  GANN: { name: 'Gann Cycles', arabic: 'جان', engine: gannEngine },
}
