import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { dollars, type Product, type Observation } from '@bowl/shared';
import { useReceiptRuntime } from './RuntimeProvider';
import { demoHistory } from './demo';
import { Card, ErrorBox, Loading, s, colors } from './ui';
export function ProductView({
  product,
  demo,
  onReceipt,
}: {
  product: Product;
  demo: boolean;
  onReceipt: (id: string) => void;
}) {
  const { api, connection, imageUri } = useReceiptRuntime();
  const [history, setHistory] = useState<Observation[]>(),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (demo) {
      setHistory(demoHistory);
      return;
    }
    api<{ observations: Observation[] }>(
      `/products/history?key=${encodeURIComponent(product.key)}`,
    )
      .then((r) => {
        if (active) setHistory(r.observations);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [product.key, demo]);
  const prices =
    history?.flatMap((o) =>
      o.unit_price_cents === null ? [] : [o.unit_price_cents],
    ) ?? [];
  const max = Math.max(1, ...prices);
  return (
    <>
      <View>
        <Text style={s.eyebrow}>An ingredient's story</Text>
        <Text style={[s.title, { marginTop: 8 }]}>{product.name}</Text>
        <Text style={[s.muted, { marginTop: 8 }]}>
          {product.merchant} ·{' '}
          {product.code
            ? `Code ${product.code}`
            : 'Grouped by printed description'}{' '}
          · {product.unit ?? 'unknown unit'}
        </Text>
      </View>
      <Card>
        <View style={s.between}>
          <Text style={s.heading}>{product.visits} trips</Text>
          <Text style={s.heading}>{dollars(product.spend_cents)}</Text>
        </View>
        {product.pounds > 0 ? (
          <Text style={s.body}>
            You've brought home {product.pounds.toFixed(1)} lb.
          </Text>
        ) : null}
      </Card>
      {error ? <ErrorBox message={error} /> : null}
      {!history && !error ? <Loading /> : null}
      {prices.length ? (
        <View style={s.row}>
          <Card style={{ flex: 1 }}>
            <Text style={s.eyebrow}>Lowest / {product.unit ?? 'unit'}</Text>
            <Text style={s.heading}>{dollars(Math.min(...prices))}</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={s.eyebrow}>Highest / {product.unit ?? 'unit'}</Text>
            <Text style={s.heading}>{dollars(max)}</Text>
          </Card>
        </View>
      ) : null}
      <Card>
        <Text style={s.heading}>Price observations</Text>
        <Text style={s.muted}>
          Printed unit prices, before any separate line discount. Tap an
          observation to open its receipt.
        </Text>
        {history?.map((o, i) => (
          <Pressable
            accessibilityRole="button"
            key={i}
            onPress={() => onReceipt(o.receipt_id)}
            style={{ gap: 8, paddingVertical: 10 }}
          >
            <View style={s.between}>
              <Text style={s.body}>{o.purchased_at ?? 'Date unknown'}</Text>
              <Text style={s.link}>
                {dollars(o.unit_price_cents)} / {o.unit ?? 'unit'} ›
              </Text>
            </View>
            <View
              style={{
                height: 7,
                backgroundColor: colors.lime,
                borderRadius: 5,
              }}
            >
              <View
                style={{
                  width: `${Math.max(0, ((o.unit_price_cents ?? 0) / max) * 100)}%`,
                  height: 7,
                  borderRadius: 5,
                  backgroundColor: colors.green,
                }}
              />
            </View>
            <Text style={s.muted}>
              {o.quantity ?? '?'} {o.unit ?? 'units'} ·{' '}
              {dollars(o.extended_price_cents)} total
            </Text>
          </Pressable>
        ))}
      </Card>
      <Card>
        <Text style={s.heading}>Names on the receipts</Text>
        {product.aliases.map((a) => (
          <Text key={a} style={s.body}>
            {a}
          </Text>
        ))}
        <Text style={s.muted}>
          Merchant codes are candidate identities. These observed descriptions
          let you spot a reused or ambiguous code; matching codes don't prove
          it's the same product.
        </Text>
      </Card>
    </>
  );
}
