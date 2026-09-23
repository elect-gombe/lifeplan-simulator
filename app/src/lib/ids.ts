/**
 * イベント id の生成。
 * Date.now() ベースだと同一ミリ秒内の一括生成で衝突する（子供3人分で20件超を作ると必ず重複）ため、
 * 「前回値+1 と 現在時刻(µs 相当) の大きい方」を返す単調増加カウンタにする。
 * 既存データの id（Date.now() 由来 ≒ 1.7e12）と桁が異なるので、過去に発行された id とも重ならない。
 */
let last = 0;
export function nextEventId(): number {
  const t = Date.now() * 1000;
  last = Math.max(last + 1, t);
  return last;
}
