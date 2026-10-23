import React, { useState } from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { dollars, type Product, type Stats } from '@bowl/shared';
import { colors, s, Card, Chip, Button, PlantMark } from './ui';
export function Explore({
  stats,
  period,
  setPeriod,
  onProduct,
  onScan,
}: {
  stats: Stats;
  period: string;
  setPeriod: (p: 'week' | 'month' | 'year') => void;
  onProduct: (p: Product) => void;
  onScan: () => void;
}) {
  const [rank, setRank] = useState<'visits' | 'spend_cents' | 'pounds'>(
    'visits',
  );
  const max = Math.max(1, ...stats.months.map((m) => m.spend_cents));
  return (
    <>
      <View>
        <Text style={s.eyebrow}>A little grocery curiosity</Text>
        <Text style={[s.title, { marginTop: 8 }]}>Your basket, over time.</Text>
        <Text style={[s.muted, { marginTop: 8 }]}>
          The stories hiding in your Berkeley Bowl receipts.
        </Text>
      </View>
      <Card
        style={{ backgroundColor: colors.green, borderWidth: 0, padding: 24 }}
      >
        <Text style={[s.eyebrow, { color: '#C3D6BD' }]}>
          A lifetime of good groceries
        </Text>
        <Text
          style={{
            fontSize: 46,
            fontWeight: '600',
            color: '#FFF',
            letterSpacing: -2,
          }}
        >
          {dollars(stats.spend_cents)}
        </Text>
        <View style={[s.between, { marginTop: 10 }]}>
          <Text style={{ color: '#DFEAD8' }}>
            {stats.visits} trips to the store
          </Text>
          <PlantMark />
        </View>
      </Card>
      {!stats.visits ? (
        <Card>
          <Text style={s.heading}>Start with one receipt.</Text>
          <Text style={s.body}>
            Snap it, save it, get on with your day. Your grocery history will
            build itself.
          </Text>
          <Button label="Scan your first receipt" onPress={onScan} />
        </Card>
      ) : null}
      <View style={s.row}>
        <Card style={{ flex: 1 }}>
          <Text style={s.eyebrow}>Produce</Text>
          <Text style={s.heading}>{stats.produce_pounds.toFixed(1)} lb</Text>
          <Text style={s.muted}>Known weights</Text>
        </Card>
        <Card style={{ flex: 1 }}>
          <Text style={s.eyebrow}>Average trip</Text>
          <Text style={s.heading}>{dollars(stats.average_basket_cents)}</Text>
          <Text style={s.muted}>{stats.line_items} line items</Text>
        </Card>
      </View>
      <Card>
        <View style={s.between}>
          <Text style={s.heading}>Grocery rhythms</Text>
          <Text style={s.muted}>USD</Text>
        </View>
        <View style={s.row}>
          {(['week', 'month', 'year'] as const).map((p) => (
            <Chip
              key={p}
              label={p[0].toUpperCase() + p.slice(1)}
              selected={period === p}
              onPress={() => setPeriod(p)}
            />
          ))}
        </View>
        {stats.months.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                gap: 14,
                paddingTop: 18,
              }}
            >
              {stats.months.map((m) => (
                <View
                  key={m.period}
                  accessibilityLabel={`${m.period}: ${dollars(m.spend_cents)}, ${m.visits} visits`}
                  style={{ alignItems: 'center', gap: 8, width: 64 }}
                >
                  <Text style={{ fontSize: 10, color: colors.muted }}>
                    {dollars(m.spend_cents)}
                  </Text>
                  <View
                    style={{
                      height: Math.max(
                        5,
                        (Math.abs(m.spend_cents) / max) * 110,
                      ),
                      width: 30,
                      borderRadius: 8,
                      backgroundColor: colors.green,
                    }}
                  />
                  <Text style={s.muted}>
                    {period === 'year'
                      ? m.period.slice(0, 4)
                      : period === 'month'
                        ? new Date(m.period + 'T12:00:00').toLocaleDateString(
                            'en-US',
                            { month: 'short' },
                          )
                        : m.period.slice(5)}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : (
          <Text style={s.muted}>
            Your first processed receipt starts the story.
          </Text>
        )}
      </Card>
      <View style={{ gap: 12 }}>
        <Text style={s.heading}>The regulars</Text>
        <View style={s.row}>
          {(
            [
              ['visits', 'Most bought'],
              ['spend_cents', 'Most spent'],
              ['pounds', 'By weight'],
            ] as const
          ).map(([v, label]) => (
            <Chip
              key={v}
              label={label}
              selected={rank === v}
              onPress={() => setRank(v)}
            />
          ))}
        </View>
        <Card>
          {[...stats.products]
            .sort((a, b) => b[rank] - a[rank])
            .slice(0, 20)
            .map((p, i) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`View ${p.name} price history`}
                key={p.key}
                onPress={() => onProduct(p)}
                style={[s.row, { paddingVertical: 9 }]}
              >
                <Text style={{ fontSize: 13, color: colors.muted, width: 20 }}>
                  {String(i + 1).padStart(2, '0')}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.body, { fontWeight: '600' }]}>{p.name}</Text>
                  <Text style={s.muted}>
                    {p.visits} trips · {p.unit ?? 'unit unknown'}
                  </Text>
                </View>
                <Text style={s.link}>
                  {rank === 'pounds'
                    ? `${p.pounds.toFixed(1)} lb`
                    : dollars(p.spend_cents)}{' '}
                  ›
                </Text>
              </Pressable>
            ))}
          {!stats.products.length ? (
            <Text style={s.muted}>
              Your most-loved ingredients will show up here.
            </Text>
          ) : null}
        </Card>
      </View>
      {stats.review_included > 0 ? (
        <Text style={s.muted}>
          {stats.review_included} receipt
          {stats.review_included === 1 ? '' : 's'} with a total mismatch
          included. These are best-effort stats.
        </Text>
      ) : null}
      {stats.excluded_currency > 0 ? (
        <Text style={s.muted}>
          {stats.excluded_currency} receipts with unknown/non-USD currency
          excluded.
        </Text>
      ) : null}
      {stats.undated_receipts > 0 ? (
        <Text style={s.muted}>
          {stats.undated_receipts} undated receipts included in lifetime totals,
          excluded from trends.
        </Text>
      ) : null}
    </>
  );
}
