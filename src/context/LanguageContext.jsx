'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';
import { updateUserProfile } from '@/lib/firestore/profile';
import { DEFAULT_LANGUAGE, normalizeLanguage, translateText } from '@/lib/i18n/translations';

const LanguageContext = createContext({
  language: DEFAULT_LANGUAGE,
  setLanguage: async () => {},
  isLanguageSaving: false,
  languageReady: false,
});

function translateDom(root, language, originalText, originalAttributes) {
  if (!root || !root.querySelectorAll) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || parent.closest('script,style,code,pre,textarea,[contenteditable="true"]')) continue;
    const current = node.nodeValue || '';
    const record = originalText.get(node);
    const source = record && current === record.translated ? record.original : current;
    const translated = translateText(source, language);
    originalText.set(node, { original: source, translated });
    if (current !== translated) node.nodeValue = translated;
  }

  const attributes = ['placeholder', 'title', 'aria-label', 'alt'];
  const elements = [...(root.matches?.('*') ? [root] : []), ...root.querySelectorAll('*')];
  elements.forEach((element) => {
    if (!element.matches('input,textarea,select,option,button,a,[aria-label],[title],[placeholder],[alt]')) return;
    let records = originalAttributes.get(element);
    if (!records) {
      records = new Map();
      originalAttributes.set(element, records);
    }
    attributes.forEach((attribute) => {
      if (!element.hasAttribute(attribute)) return;
      const current = element.getAttribute(attribute) || '';
      const record = records.get(attribute);
      const source = record && current === record.translated ? record.original : current;
      const translated = translateText(source, language);
      records.set(attribute, { original: source, translated });
      if (current !== translated) element.setAttribute(attribute, translated);
    });
  });
}

export function LanguageProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [language, setLanguageState] = useState(DEFAULT_LANGUAGE);
  const [isLanguageSaving, setIsLanguageSaving] = useState(false);
  const [languageReady, setLanguageReady] = useState(false);
  const originalText = useRef(new WeakMap());
  const originalAttributes = useRef(new WeakMap());

  useEffect(() => {
    if (authLoading) {
      setLanguageReady(false);
      return undefined;
    }

    if (!user) {
      let preferred = DEFAULT_LANGUAGE;
      try {
        preferred = normalizeLanguage(window.localStorage.getItem('pata-language'));
      } catch {
        preferred = DEFAULT_LANGUAGE;
      }
      setLanguageState(preferred);
      setLanguageReady(true);
      return undefined;
    }

    setLanguageReady(false);
    return onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => {
        let localLanguage = null;
        let hasPendingChoice = false;
        try {
          hasPendingChoice = window.localStorage.getItem('pata-language-pending') === '1';
          const localValue = window.localStorage.getItem('pata-language');
          localLanguage = localValue === 'fr' || localValue === 'en' ? localValue : null;
        } catch {
          // Le profil Firestore reste la source de secours.
        }

        const profileLanguage = snapshot.exists() ? snapshot.data()?.language : null;
        const storedLanguage = hasPendingChoice && localLanguage
          ? localLanguage
          : profileLanguage || localLanguage || DEFAULT_LANGUAGE;
        const normalized = normalizeLanguage(storedLanguage);
        setLanguageState(normalized);
        try { window.localStorage.setItem('pata-language', normalized); } catch { /* stockage local indisponible */ }
        setLanguageReady(true);
      },
      (error) => {
        console.error('[PATA LANGUAGE]', error?.message || error);
        let fallback = DEFAULT_LANGUAGE;
        try {
          fallback = normalizeLanguage(window.localStorage.getItem('pata-language'));
        } catch {
          fallback = DEFAULT_LANGUAGE;
        }
        setLanguageState(fallback);
        setLanguageReady(true);
      },
    );
  }, [user, authLoading]);

  useEffect(() => {
    if (typeof document === 'undefined' || !document.body) return undefined;
    document.documentElement.lang = language;
    translateDom(document.body, language, originalText.current, originalAttributes.current);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData') {
          const target = mutation.target;
          const parent = target.parentElement;
          if (!parent || parent.closest('script,style,code,pre,textarea,[contenteditable="true"]')) return;
          const current = target.nodeValue || '';
          const record = originalText.current.get(target);
          const source = record && current === record.translated ? record.original : current;
          const translated = translateText(source, language);
          originalText.current.set(target, { original: source, translated });
          if (current !== translated) target.nodeValue = translated;
        } else if (mutation.type === 'attributes') {
          translateDom(mutation.target, language, originalText.current, originalAttributes.current);
        } else {
          mutation.addedNodes?.forEach((added) => {
            if (added.nodeType === Node.TEXT_NODE) {
              const parent = added.parentElement;
              if (!parent || parent.closest('script,style,code,pre,textarea,[contenteditable="true"]')) return;
              const current = added.nodeValue || '';
              const translated = translateText(current, language);
              originalText.current.set(added, { original: current, translated });
              if (current !== translated) added.nodeValue = translated;
            } else if (added.nodeType === Node.ELEMENT_NODE) {
              translateDom(added, language, originalText.current, originalAttributes.current);
            }
          });
        }
      });
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label', 'alt'],
    });
    return () => observer.disconnect();
  }, [language]);

  const setLanguage = useCallback(async (nextLanguage) => {
    const normalized = normalizeLanguage(nextLanguage);

    if (!user) {
      try {
        window.localStorage.setItem('pata-language', normalized);
        window.localStorage.setItem('pata-language-pending', '1');
      } catch {
        // La langue reste modifiable pendant cette session sans stockage local.
      }
      setLanguageState(normalized);
      return;
    }

    setIsLanguageSaving(true);
    try {
      await updateUserProfile(user.uid, { language: normalized });
      try {
        window.localStorage.setItem('pata-language', normalized);
        window.localStorage.removeItem('pata-language-pending');
      } catch { /* stockage local indisponible */ }
      setLanguageState(normalized);
    } finally {
      setIsLanguageSaving(false);
    }
  }, [user]);

  const value = useMemo(
    () => ({ language, setLanguage, isLanguageSaving, languageReady }),
    [language, setLanguage, isLanguageSaving, languageReady],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
