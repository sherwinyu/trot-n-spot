import { DudleyLoading } from '@/components/dudley/Dudley';
import React, { useEffect, useState } from 'react';
import { Image, Modal, Platform, ScrollView, Text, View } from 'react-native';
import {
  dollars,
  editMoney,
  parseMoney,
  extractionSchema,
  type Extraction,
  type LineItem,
  type ReceiptDetail,
} from '@bowl/shared';
import { useReceiptRuntime } from './RuntimeProvider';
import {
  Card,
  Button,
  Chip,
  Field,
  ErrorBox,
  StatusBadge,
  colors,
  s,
} from './ui';

export function ReceiptView({
  receipt,
  onChange,
  demo,
}: {
  receipt: ReceiptDetail;
  onChange: () => void;
  demo: boolean;
}) {
  const { api, imageUri } = useReceiptRuntime();
  const [editing, setEditing] = useState(false),
    [raw, setRaw] = useState(false),
    [photo, setPhoto] = useState<string>(),
    [zoom, setZoom] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  useEffect(() => {
    let alive = true;
    setPhoto(undefined);
    const refreshPhoto = () => {
      if (!demo)
        void imageUri(receipt.id)
          .then((u) => {
            if (alive) setPhoto(u);
          })
          .catch((e) => {
            if (alive) setError(e.message);
          });
    };
    refreshPhoto();
    // Renew the five-minute private URL while this receipt is open.
    const timer = setInterval(refreshPhoto, 240_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [receipt.id, demo]);
  if (editing)
    return (
      <ReceiptEditor
        receipt={receipt}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onChange();
        }}
      />
    );
  const retry = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/receipts/${receipt.id}/reprocess`, {
        method: 'POST',
        body: JSON.stringify({ revision: receipt.revision }),
      });
      setConfirm(false);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <View style={s.between}>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>
            {receipt.purchased_at ?? 'Date not yet known'}
          </Text>
          <Text style={[s.title, { marginTop: 8 }]}>
            {receipt.merchant ?? 'New receipt'}
          </Text>
        </View>
        <StatusBadge status={receipt.status} />
      </View>
      <DudleyLoading loading={receipt.status === 'processing'} mood="sniff" label="Reading receipt…" compact />
      <Card>
        <Text style={{ fontSize: 42, fontWeight: '600', color: colors.ink }}>
          {dollars(receipt.total_cents, receipt.currency ?? 'USD')}
        </Text>
        <Text style={s.muted}>
          {receipt.store_location ?? 'Location not recorded'} ·{' '}
          {receipt.line_items.length} items
        </Text>
        {receipt.reconciliation_delta_cents === 0 ? (
          <Text style={s.link}>✓ The numbers add up.</Text>
        ) : receipt.reconciliation_delta_cents !== null ? (
          <Text style={{ color: colors.amber }}>
            Calculated total differs by{' '}
            {dollars(receipt.reconciliation_delta_cents)}.
          </Text>
        ) : (
          <Text style={s.muted}>
            {receipt.reconciliation_reason ?? 'Waiting for extraction.'}
          </Text>
        )}
        {receipt.last_error ? <ErrorBox message={receipt.last_error} /> : null}
      </Card>
      {error ? <ErrorBox message={error} /> : null}
      {photo ? (
        <Card>
          <Text style={s.heading}>Your original receipt</Text>
          <Image
            accessibilityLabel="Receipt photograph"
            source={{
              uri: photo,
            }}
            resizeMode="contain"
            style={{ height: 250, width: '100%', backgroundColor: '#F2F1E9' }}
          />
          <Button label="View photo" secondary onPress={() => setZoom(true)} />
        </Card>
      ) : demo ? (
        <Card>
          <Text style={s.muted}>
            Synthetic demo receipt. No original photo.
          </Text>
        </Card>
      ) : null}
      <Card>
        <Text style={s.heading}>In the basket</Text>
        {receipt.line_items.map((l, i) => (
          <View
            key={i}
            style={{
              gap: 3,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
            }}
          >
            <View style={s.between}>
              <Text style={[s.body, { flex: 1, fontWeight: '600' }]}>
                {l.normalized_description ?? l.raw_description}
              </Text>
              <Text style={s.body}>
                {dollars(l.extended_price_cents, receipt.currency ?? 'USD')}
              </Text>
            </View>
            <Text style={s.muted}>
              {l.quantity ?? '?'} {l.unit ?? 'units'}
              {l.unit_price_cents !== null
                ? ` × ${dollars(l.unit_price_cents)}/${l.unit ?? 'unit'}`
                : ''}
            </Text>
            <Text style={[s.muted, { fontSize: 11 }]}>
              {l.raw_description}
              {l.merchant_item_code ? ` · #${l.merchant_item_code}` : ''}
            </Text>
            {!!l.line_discount_cents ? (
              <Text style={s.muted}>
                {dollars(l.line_discount_cents)} line discount already included
              </Text>
            ) : null}
          </View>
        ))}
        {(
          [
            'subtotal_cents',
            'tax_cents',
            'discounts_cents',
            'fees_cents',
          ] as const
        ).map((k) => (
          <View style={s.between} key={k}>
            <Text style={s.muted}>
              {k
                .replace('_cents', '')
                .replace('discounts', 'Additional discounts')}
            </Text>
            <Text style={s.body}>
              {dollars(receipt[k], receipt.currency ?? 'USD')}
            </Text>
          </View>
        ))}
      </Card>
      {!demo ? (
        <View style={s.row}>
          <Button
            style={{ flex: 1 }}
            label="Edit receipt"
            secondary
            onPress={() => setEditing(true)}
          />
          <Button
            style={{ flex: 1 }}
            label="Read again"
            disabled={busy}
            secondary
            onPress={() => setConfirm(true)}
          />
        </View>
      ) : null}
      {confirm ? (
        <Card>
          <Text style={s.body}>
            Read the original photo again? New extraction will replace current
            fields and items. Earlier extractions and edits stay in the history.
          </Text>
          <Button
            label={busy ? 'Queuing…' : 'Reprocess receipt'}
            disabled={busy}
            onPress={() => void retry()}
          />
          <Button label="Cancel" secondary onPress={() => setConfirm(false)} />
        </Card>
      ) : null}
      <Button
        label={raw ? 'Hide extraction history' : 'Show extraction history'}
        secondary
        onPress={() => setRaw(!raw)}
      />
      {raw ? (
        <Card>
          <Text
            selectable
            style={{
              fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
              fontSize: 11,
              lineHeight: 17,
              color: colors.muted,
            }}
          >
            {JSON.stringify(
              {
                latest_model_response: receipt.raw_extraction,
                history: receipt.attempts,
              },
              null,
              2,
            )}
          </Text>
        </Card>
      ) : null}
      <Modal
        visible={zoom}
        onRequestClose={() => setZoom(false)}
        animationType="slide"
      >
        <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 50 }}>
          <Button label="Close photo" onPress={() => setZoom(false)} />
          <ScrollView
            maximumZoomScale={4}
            minimumZoomScale={1}
            contentContainerStyle={{ padding: 10 }}
          >
            <Image
              source={{
                uri: photo,
              }}
              resizeMode="contain"
              style={{ width: '100%', height: 1200 }}
            />
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const emptyLine: LineItem = {
  merchant_item_code: null,
  raw_description: '',
  normalized_description: null,
  category: null,
  quantity: null,
  unit: null,
  unit_price_cents: null,
  extended_price_cents: null,
  line_discount_cents: null,
  raw_line: null,
};
function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const [text, setText] = useState(editMoney(value)),
    [invalid, setInvalid] = useState(false);
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Field
        label={label}
        value={text}
        keyboardType="numbers-and-punctuation"
        onChangeText={(v) => {
          setText(v);
          try {
            onChange(parseMoney(v));
            setInvalid(false);
          } catch {
            onChange(Number.NaN);
            setInvalid(true);
          }
        }}
      />
      {invalid ? (
        <Text style={{ color: colors.red, fontSize: 11 }}>
          Invalid amount — use 0.00
        </Text>
      ) : null}
    </View>
  );
}
function ReceiptEditor({
  receipt,
  onCancel,
  onSaved,
}: {
  receipt: ReceiptDetail;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { api } = useReceiptRuntime();
  const [draft, setDraft] = useState<Extraction>(() =>
      extractionSchema.parse(receipt),
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [baseRevision] = useState(receipt.revision);
  const [rowKeys, setRowKeys] = useState(() =>
    receipt.line_items.map((_, i) => `initial-${i}`),
  );
  const set = (key: keyof Extraction, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const line = (index: number, key: keyof LineItem, value: unknown) =>
    setDraft((d) => ({
      ...d,
      line_items: d.line_items.map((l, i) =>
        i === index ? { ...l, [key]: value } : l,
      ),
    }));
  async function save() {
    setBusy(true);
    setError('');
    try {
      await api(`/receipts/${receipt.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          revision: baseRevision,
          data: extractionSchema.parse(draft),
        }),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Text style={s.title}>Make a correction.</Text>
      <Text style={s.muted}>
        Blank means unknown. All amounts are dollars. Line amounts include their
        line discounts; receipt discounts are additional.
      </Text>
      {error ? <ErrorBox message={error} /> : null}
      <Card>
        {(
          ['merchant', 'store_location', 'purchased_at', 'currency'] as const
        ).map((k) => (
          <Field
            key={k}
            label={
              k === 'purchased_at'
                ? 'Purchase date (YYYY-MM-DD)'
                : k.replaceAll('_', ' ')
            }
            value={draft[k] ?? ''}
            autoCapitalize={k === 'currency' ? 'characters' : 'none'}
            onChangeText={(v) => set(k, v || null)}
          />
        ))}
        {(
          [
            'subtotal_cents',
            'tax_cents',
            'discounts_cents',
            'fees_cents',
            'total_cents',
          ] as const
        ).map((k) => (
          <MoneyField
            key={k}
            label={k
              .replace('_cents', '')
              .replace('discounts', 'Additional discounts')}
            value={draft[k]}
            onChange={(v) => set(k, v)}
          />
        ))}
      </Card>
      {draft.line_items.map((l, i) => (
        <Card key={rowKeys[i]}>
          <View style={s.between}>
            <Text style={s.heading}>Item {i + 1}</Text>
            <Chip
              label="Remove"
              onPress={() => {
                set(
                  'line_items',
                  draft.line_items.filter((_, n) => n !== i),
                );
                setRowKeys((keys) => keys.filter((_, n) => n !== i));
              }}
            />
          </View>
          <Field
            label="Printed description"
            value={l.raw_description}
            onChangeText={(v) => line(i, 'raw_description', v)}
          />
          <Field
            label="Readable name"
            value={l.normalized_description ?? ''}
            onChangeText={(v) => line(i, 'normalized_description', v || null)}
          />
          <Field
            label="Merchant code"
            value={l.merchant_item_code ?? ''}
            onChangeText={(v) => line(i, 'merchant_item_code', v || null)}
          />
          <Field
            label="Quantity / weight"
            value={l.quantity ?? ''}
            keyboardType="numbers-and-punctuation"
            onChangeText={(v) => line(i, 'quantity', v || null)}
          />
          <ScrollView horizontal>
            <View style={s.row}>
              {([null, 'each', 'lb', 'oz', 'kg', 'g'] as const).map((u) => (
                <Chip
                  key={u ?? '?'}
                  label={u ?? 'Unknown unit'}
                  selected={l.unit === u}
                  onPress={() => line(i, 'unit', u)}
                />
              ))}
            </View>
          </ScrollView>
          <View style={s.row}>
            {([null, 'produce', 'other'] as const).map((c) => (
              <Chip
                key={c ?? '?'}
                label={c ?? 'Unknown category'}
                selected={l.category === c}
                onPress={() => line(i, 'category', c)}
              />
            ))}
          </View>
          <MoneyField
            label="Price per unit"
            value={l.unit_price_cents}
            onChange={(v) => line(i, 'unit_price_cents', v)}
          />
          <MoneyField
            label="Net line amount"
            value={l.extended_price_cents}
            onChange={(v) => line(i, 'extended_price_cents', v)}
          />
          <MoneyField
            label="Included line discount"
            value={l.line_discount_cents}
            onChange={(v) => line(i, 'line_discount_cents', v)}
          />
        </Card>
      ))}
      <Button
        label="Add line item"
        secondary
        onPress={() => {
          set('line_items', [...draft.line_items, { ...emptyLine }]);
          setRowKeys((keys) => [...keys, `${Date.now()}-${Math.random()}`]);
        }}
      />
      <Button
        label={busy ? 'Saving…' : 'Save corrections'}
        disabled={busy}
        onPress={() => void save()}
      />
      <Button label="Cancel" disabled={busy} secondary onPress={onCancel} />
    </>
  );
}
