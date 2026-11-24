import { View, StyleSheet } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { colors, radius } from '@/theme';
import { T } from './T';
import { Icon, type IconName } from './Icon';
import { Card } from './Card';

// 4-week chart with this week highlighted (TrendCard.dc.html).
export type TrendCardProps = {
  title: string;
  status: 'ok' | 'warn' | 'alert' | 'empty';
  word: string;
  summary: string;
  compare: string;
  bandLabel: string;
  points: (number | null)[]; // 28 daily values, oldest first
  band: [number, number];
  alertBand: [number, number] | null;
  domain: [number, number];
  weeks: string[];
  emptyText: string;
};

const PILL: Record<'ok' | 'warn' | 'alert', { bg: string; ink: string; icon: IconName }> = {
  ok: { bg: colors.priSoft, ink: colors.ok, icon: 'check' },
  warn: { bg: colors.warnSoft, ink: colors.warnInk, icon: 'warn' },
  alert: { bg: colors.dangerSoft, ink: colors.danger, icon: 'alert' },
};

const W = 318;
const H = 132;
const PAD = 10;
const r1 = (n: number) => +n.toFixed(1);

// SVG geometry for the chart, plus the counts the accessibility label needs.
export function chartPaths(points: (number | null)[], band: [number, number], alertBand: [number, number] | null, domain: [number, number]) {
  const n = points.length || 28;
  const step = W / (n - 1);
  const [dMin, dMax] = domain;
  const span = dMax - dMin || 1;
  const [lo, hi] = band;
  const y = (v: number) => PAD + (1 - (Math.max(dMin, Math.min(dMax, v)) - dMin) / span) * (H - PAD * 2);
  const x = (i: number) => r1(i * step);
  const curStart = n - 7;
  const path = (a: number, b: number) => {
    let d = '';
    let pen = false;
    for (let i = a; i <= b; i++) {
      const v = points[i];
      if (v == null) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${x(i)} ${y(v).toFixed(1)} `;
      pen = true;
    }
    return d.trim();
  };
  const dot = (i: number, r: number) => {
    const cx = x(i);
    const cy = y(points[i]!).toFixed(1);
    return `M${r1(cx - r)} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
  };
  let warnDots = '';
  let alertDots = '';
  let outCur = 0;
  let readings = 0;
  points.forEach((v, i) => {
    if (v == null) return;
    const cur = i >= curStart;
    if (cur) readings++;
    if (v >= lo && v <= hi) return;
    if (cur) outCur++;
    const d = dot(i, cur ? 5 : 3.5);
    if (alertBand && (v < alertBand[0] || v > alertBand[1])) alertDots += d;
    else warnDots += d;
  });
  const seps = [1, 2, 3].map((k) => `M${(x(k * 7) - step / 2).toFixed(1)} 0V${H}`).join('');
  const bandTop = y(hi);
  const curX = r1(x(curStart) - step / 2);
  return {
    curX,
    curW: r1(W - curX + 4),
    bandY: r1(bandTop),
    bandH: r1(Math.max(0, y(lo) - bandTop)),
    seps,
    prevPath: path(0, curStart),
    curPath: path(curStart, n - 1),
    warnDots,
    alertDots,
    readings,
    outCur,
  };
}

export function TrendCard(p: TrendCardProps) {
  const empty = p.status === 'empty';
  const pill = p.status === 'empty' ? null : PILL[p.status];
  const g = chartPaths(p.points, p.band, p.alertBand, p.domain);
  const aria = `${p.title}: gráfica de 4 semanas. Esta semana, ${g.readings} días con lecturas, ${g.outCur} fuera de su rango.`;
  return (
    <Card gap={12}>
      <View style={s.head}>
        <T size={17} bold lh={1.3} accessibilityRole="header" style={s.flex}>{p.title}</T>
        {pill && p.word ? (
          <View style={[s.pill, { backgroundColor: pill.bg }]}>
            <Icon name={pill.icon} size={15} color={pill.ink} strokeWidth={2.6} />
            <T size={14} bold color={pill.ink}>{p.word}</T>
          </View>
        ) : null}
      </View>
      {empty ? (
        <View style={s.empty}>
          <T size={16} lh={1.45} color={colors.ink2}>{p.emptyText}</T>
        </View>
      ) : (
        <>
          <T size={16} lh={1.4}>{p.summary}</T>
          <View>
            <View accessible accessibilityRole="image" accessibilityLabel={aria} style={s.chart}>
              <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={s.visible}>
                <Rect x={g.curX} y={0} width={g.curW} height={H} rx={8} fill={colors.bg} />
                <Rect x={0} y={g.bandY} width={W} height={g.bandH} fill={colors.priSoft} />
                <Path d={g.seps} fill="none" stroke={colors.line} strokeWidth={1.5} strokeDasharray="3 4" />
                {g.prevPath ? <Path d={g.prevPath} fill="none" stroke={colors.field} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /> : null}
                {g.curPath ? <Path d={g.curPath} fill="none" stroke={colors.pri} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" /> : null}
                {g.warnDots ? <Path d={g.warnDots} fill={colors.warn} stroke={colors.surface} strokeWidth={2} /> : null}
                {g.alertDots ? <Path d={g.alertDots} fill={colors.danger} stroke={colors.surface} strokeWidth={2} /> : null}
              </Svg>
            </View>
            <View style={s.weeks} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {p.weeks.map((w, i) => {
                const last = i === p.weeks.length - 1;
                return (
                  <T key={w} size={13} center bold={last} color={last ? colors.ink : colors.ink2} style={s.flex}>{w}</T>
                );
              })}
            </View>
          </View>
          <View style={s.legend}>
            <View style={s.legendItem}>
              <View style={s.swatchBand} />
              <T size={14} color={colors.ink2} style={s.shrink}>{p.bandLabel}</T>
            </View>
            <View style={s.legendItem}>
              <View style={s.swatchLine} />
              <T size={14} color={colors.ink2}>Esta semana</T>
            </View>
          </View>
          {p.compare ? (
            <View style={s.compare}>
              <T size={15} lh={1.4} color={colors.ink2}>{p.compare}</T>
            </View>
          ) : null}
        </>
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 11, flexShrink: 0 },
  empty: { padding: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.field, borderRadius: 14, borderCurve: 'continuous' },
  chart: { width: '100%', aspectRatio: W / H },
  visible: { overflow: 'visible' },
  weeks: { flexDirection: 'row', marginTop: 6 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, columnGap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatchBand: { width: 18, height: 10, borderRadius: 3, borderCurve: 'continuous', backgroundColor: colors.priSoft, borderWidth: 1, borderColor: colors.line },
  swatchLine: { width: 18, height: 4, borderRadius: 2, backgroundColor: colors.pri },
  compare: { paddingTop: 10, borderTopWidth: 1.5, borderTopColor: colors.line },
});
