import React from "react";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

import { BRAND_GOLD } from "@/config/brandMotion";
import {
  GOLD_RULE,
  LEDGER_CUT,
  LEDGER_V_VIEWBOX,
  V_PATH_D,
  V_STROKE,
} from "@/components/boot/ledgerVMarkGeometry";

interface LedgerVMarkSvgProps {
  size: number;
  tracerX: number;
  tracerY: number;
  tracerVisible: boolean;
  goldOpacity: number;
  leftTrailLen: number;
  rightTrailLen: number;
  leftArmLen: number;
  strokeColor?: string;
  cutFill?: string;
}

/** Static SVG mark — no Reanimated props (Expo Go safe). */
export function LedgerVMarkSvg({
  size,
  tracerX,
  tracerY,
  tracerVisible,
  goldOpacity,
  leftTrailLen,
  rightTrailLen,
  leftArmLen,
  strokeColor = V_STROKE.color,
  cutFill = LEDGER_CUT.fill,
}: LedgerVMarkSvgProps) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${LEDGER_V_VIEWBOX} ${LEDGER_V_VIEWBOX}`}>
      <Path
        d={V_PATH_D}
        stroke={strokeColor}
        strokeWidth={V_STROKE.width}
        strokeLinejoin={V_STROKE.linejoin}
        strokeMiterlimit={V_STROKE.miterlimit}
        strokeLinecap={V_STROKE.linecap}
        fill="none"
      />
      <Rect
        x={LEDGER_CUT.x}
        y={LEDGER_CUT.y}
        width={LEDGER_CUT.width}
        height={LEDGER_CUT.height}
        fill={cutFill}
      />
      <Line
        x1={GOLD_RULE.x1}
        y1={GOLD_RULE.y1}
        x2={GOLD_RULE.x2}
        y2={GOLD_RULE.y2}
        stroke={BRAND_GOLD}
        strokeWidth={GOLD_RULE.strokeWidth}
        opacity={goldOpacity}
      />
      <Path
        d="M 12 11 L 40 68"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth={1.5}
        fill="none"
        strokeDasharray={`${leftTrailLen} ${leftArmLen}`}
        opacity={tracerVisible ? 1 : 0}
      />
      <Path
        d="M 40 68 L 68 11"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth={1.5}
        fill="none"
        strokeDasharray={`${rightTrailLen} ${leftArmLen}`}
        opacity={tracerVisible ? 1 : 0}
      />
      {tracerVisible ? (
        <>
          <Circle cx={tracerX} cy={tracerY} r={4.5} fill="rgba(255,255,255,0.25)" />
          <Circle cx={tracerX} cy={tracerY} r={3} fill="#FFFFFF" />
        </>
      ) : null}
    </Svg>
  );
}
