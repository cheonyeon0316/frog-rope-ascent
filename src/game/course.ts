import { type Course, type Mode, type SaveState } from './types';
import { makeLegacyCourse } from './legacy-course';
import { ECOSYSTEM_ID, makeEcosystem } from './ecosystem';
import { ECOSYSTEM_V2_ID, makeEcosystemV2 } from './ecosystem-v2';

export function makeCourse(mode: Mode): Course {
  return mode === 'training' ? makeLegacyCourse(mode) : makeEcosystem();
}

export function courseForSave(saved: SaveState): Course {
  if (saved.course === 'garden-main-v1' || saved.mode === 'training') return makeLegacyCourse(saved.mode);
  if (saved.course === ECOSYSTEM_ID) return makeEcosystem();
  if (saved.course === ECOSYSTEM_V2_ID) return makeEcosystemV2();
  throw new Error('지원하지 않는 코스의 저장입니다.');
}
