export type StoredStudent = {
  student_id: string;
  student_name: string;
  student_name_ar?: string | null;
};

const SELF_KEY = "friends-enemies:self";
const FRIENDS_KEY = "friends-enemies:friends";
const ENEMIES_KEY = "friends-enemies:enemies";

// Self student
export function setSelfStudent(student: StoredStudent): void {
  localStorage.setItem(SELF_KEY, JSON.stringify(student));
}

export function getSelfStudent(): StoredStudent | null {
  const data = localStorage.getItem(SELF_KEY);
  return data ? JSON.parse(data) : null;
}

export function clearSelfStudent(): void {
  localStorage.removeItem(SELF_KEY);
}

// Friends list
export function getFriendsList(): StoredStudent[] {
  const data = localStorage.getItem(FRIENDS_KEY);
  return data ? JSON.parse(data) : [];
}

export function addFriend(student: StoredStudent): void {
  const friends = getFriendsList();
  if (!friends.find((f) => f.student_id === student.student_id)) {
    friends.push(student);
    localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends));
  }
}

export function removeFriend(studentId: string): void {
  const friends = getFriendsList();
  const filtered = friends.filter((f) => f.student_id !== studentId);
  localStorage.setItem(FRIENDS_KEY, JSON.stringify(filtered));
}

export function clearFriends(): void {
  localStorage.removeItem(FRIENDS_KEY);
}

// Enemies list
export function getEnemiesList(): StoredStudent[] {
  const data = localStorage.getItem(ENEMIES_KEY);
  return data ? JSON.parse(data) : [];
}

export function addEnemy(student: StoredStudent): void {
  const enemies = getEnemiesList();
  if (!enemies.find((e) => e.student_id === student.student_id)) {
    enemies.push(student);
    localStorage.setItem(ENEMIES_KEY, JSON.stringify(enemies));
  }
}

export function removeEnemy(studentId: string): void {
  const enemies = getEnemiesList();
  const filtered = enemies.filter((e) => e.student_id !== studentId);
  localStorage.setItem(ENEMIES_KEY, JSON.stringify(filtered));
}

export function clearEnemies(): void {
  localStorage.removeItem(ENEMIES_KEY);
}
