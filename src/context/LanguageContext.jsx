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
});

function translateDom(root, language, originalText, originalAttributes) {
  if (!root || !root.querySelectorAll) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || parent.closest('script,style,code,pre,textarea,[contenteditable="true"],svg')) continue;
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
  const { user } = useAuth();
  const [language, setLanguageState] = useState(DEFAULT_LANGUAGE);
  const [isLanguageSaving, setIsLanguageSaving] = useState(false);
  const originalText = useRef(new WeakMap());
  const originalAttributes = useRef(new WeakMap());

  useEffect(() => {
    if (!user) {
      setLanguageState(DEFAULT_LANGUAGE);
      return undefined;
    }
    return onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => {
        const storedLanguage = snapshot.exists() ? snapshot.data()?.language : DEFAULT_LANGUAGE;
        setLanguageState(normalizeLanguage(storedLanguage));
      },
      (error) => {
        console.error('[PATA LANGUAGE]', error?.message || error);
        setLanguageState(DEFAULT_LANGUAGE);
      },
    );
  }, [user]);

  useEffect(() => {
    if (typeof document === 'undefined' || !document.body) return undefined;
    document.documentElement.lang = language;
    translateDom(document.body, language, originalText.current, originalAttributes.current);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData') {
          const target = mutation.target;
          const parent = target.parentElement;
          if (!parent || parent.closest('script,style,code,pre,textarea,[contenteditable="true"],svg')) return;
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
              if (!parent || parent.closest('script,style,code,pre,textarea,[contenteditable="true"],svg')) return;
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
    if (!user || normalized === language) return;
    setIsLanguageSaving(true);
    try {
      await updateUserProfile(user.uid, { language: normalized });
      setLanguageState(normalized);
    } finally {
      setIsLanguageSaving(false);
    }
  }, [language, user]);

  const value = useMemo(
    () => ({ language, setLanguage, isLanguageSaving }),
    [language, setLanguage, isLanguageSaving],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
