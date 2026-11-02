'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

/**
 * Boîte de dialogue de confirmation sécurisée.
 * Force l'utilisateur à taper un mot (ex: "SUPPRIMER") pour éviter les erreurs.
 */
export function ConfirmDialog({ 
  open, onClose, onConfirm, 
  title, message, 
  confirmWord = 'CONFIRMER', 
  confirmLabel = 'Confirmer',
  variant = 'danger',
  busy = false 
}) {
  const [input, setInput] = useState('');

  const handleConfirm = () => {
    if (input.trim().toUpperCase() === confirmWord.toUpperCase()) {
      onConfirm();
      setInput('');
    }
  };

  const handleClose = () => {
    setInput('');
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title={title}>
      <div className="space-y-4">
        <div className={`flex items-start gap-3 rounded-xl p-3 ${variant === 'danger' ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`}>
          <AlertTriangle size={20} className={variant === 'danger' ? 'text-red-600' : 'text-amber-600'} />
          <p className="text-sm text-slate-700">{message}</p>
        </div>

        <div>
          <p className="text-sm text-slate-700 mb-2">
            Pour confirmer, tape <strong className="text-slate-900">{confirmWord}</strong> ci-dessous :
          </p>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={confirmWord}
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleClose} className="flex-1">
            Annuler
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={input.trim().toUpperCase() !== confirmWord.toUpperCase() || busy}
            className={`flex-1 ${variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : ''}`}
          >
            {busy ? 'Traitement…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
            }
