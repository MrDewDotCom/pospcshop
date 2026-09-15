import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Table2 } from 'lucide-react';
import { bangkokDateKeyToMs, formatThaiDate, type DailySalesPoint } from '@pcshop/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMoney } from '@/lib/format';

// One series, so one hue (validated against the card surface) and no legend: the title names it.
// Marks follow the chart spec: columns capped at 24px with a 4px rounded top, a hairline grid, and a
// hover tooltip on each column. The table view carries every value without hovering.
const SERIES = '#2a78d6';
const SERIES_HOVER = '#3987e5';
const GRID = '#e7e7e4';
const AXIS_TEXT = '#6b7280';

/** Axis ticks in Thai compact units: 12,500 → "1.3 หมื่น", 1,200,000 → "1.2 ล้าน". */
const compactBaht = new Intl.NumberFormat('th-TH', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function dayLabel(date: string, buddhistEra: boolean) {
  return formatThaiDate(bangkokDateKeyToMs(date), { buddhistEra });
}

function ChartTooltip({
  active,
  payload,
  buddhistEra,
}: {
  active?: boolean;
  payload?: { payload: DailySalesPoint }[];
  buddhistEra: boolean;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <div className="flex items-center gap-2">
        <span className="h-0.5 w-3 rounded-full" style={{ background: SERIES }} />
        <span className="font-semibold">{formatMoney(point.netSalesSatang)}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {dayLabel(point.date, buddhistEra)} · {point.saleCount.toLocaleString('th-TH')} บิล
      </div>
    </div>
  );
}

export function DailySalesChart({
  daily,
  buddhistEra,
}: {
  daily: DailySalesPoint[];
  buddhistEra: boolean;
}) {
  const [asTable, setAsTable] = useState(false);
  // Baht only positions the columns and axis ticks; every value shown as text comes from satang.
  const data = daily.map((point) => ({ ...point, baht: point.netSalesSatang / 100 }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>ยอดขายสุทธิรายวัน</CardTitle>
          <CardDescription>ยอดขายหักเงินที่คืนลูกค้าในวันนั้น</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
        >
          {asTable ? <BarChart3 /> : <Table2 />}
          {asTable ? 'ดูเป็นกราฟ' : 'ดูเป็นตาราง'}
        </Button>
      </CardHeader>
      <CardContent>
        {asTable ? (
          <div className="max-h-72 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>วันที่</TableHead>
                  <TableHead className="text-right">จำนวนบิล</TableHead>
                  <TableHead className="text-right">ยอดขายสุทธิ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {daily.map((point) => (
                  <TableRow key={point.date}>
                    <TableCell>{dayLabel(point.date, buddhistEra)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {point.saleCount.toLocaleString('th-TH')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(point.netSalesSatang)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div
            className="h-64"
            role="img"
            aria-label="กราฟยอดขายสุทธิรายวัน (ดูตัวเลขได้ที่ปุ่มดูเป็นตาราง)"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(date: string) => {
                    const label = dayLabel(date, buddhistEra);
                    // "15 ก.ย. 2569" → "15 ก.ย." (the year is noise on a day axis)
                    return label.split(' ').slice(0, 2).join(' ');
                  }}
                  tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                  interval="preserveStartEnd"
                  minTickGap={16}
                />
                <YAxis
                  tickFormatter={(value: number) => compactBaht.format(value)}
                  tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }}
                  content={<ChartTooltip buddhistEra={buddhistEra} />}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="baht"
                  fill={SERIES}
                  activeBar={{ fill: SERIES_HOVER }}
                  maxBarSize={24}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
