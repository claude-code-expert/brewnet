// T040 — ConfirmModal: replaces window.confirm() throughout the app
import { useState } from 'react';
import { useI18n } from '../i18n/useI18n.js';

interface ConfirmModalProps {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** If set, user must type this exact string before the confirm button is enabled */
  requiredInput?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  requiredInput,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { t } = useI18n();
  const [inputValue, setInputValue] = useState('');
  const canConfirm = !requiredInput || inputValue === requiredInput;

  return (
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 420 }}>
        <div style={{ padding: '24px 24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Warning icon + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: danger ? 'var(--red)' : 'var(--txt)' }}>
              {danger ? t('confirm.danger_title', '위험한 작업입니다') : t('confirm.default_title', '확인')}
            </span>
          </div>

          <div style={{ fontSize: 13, color: 'var(--txt2)', lineHeight: 1.7 }}>{message}</div>

          {requiredInput && (
            <div className="fg">
              <label className="fl" style={{ color: 'var(--txt2)' }}>
                {t('confirm.type_prefix', '확인을 위해')} <code style={{ color: 'var(--amber)', fontFamily: 'var(--mono)', fontSize: 12 }}>{requiredInput}</code> {t('confirm.type_suffix', '를 입력하세요')}
              </label>
              <input
                className="fi"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canConfirm) onConfirm(); }}
                placeholder={requiredInput}
                autoFocus
                style={{ borderColor: inputValue && !canConfirm ? 'var(--red)' : undefined }}
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button className="btn bg" onClick={onCancel}>{cancelLabel}</button>
            <button
              className="btn bp"
              style={{
                ...(danger ? { background: 'var(--red)', borderColor: 'var(--red)' } : {}),
                opacity: canConfirm ? 1 : 0.4,
                cursor: canConfirm ? 'pointer' : 'not-allowed',
              }}
              disabled={!canConfirm}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
