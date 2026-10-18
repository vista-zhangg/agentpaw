'use strict';

(function () {
  const i18n = window.AgentPawI18n;
  i18n.localizeDocument(document);
  const apply = language => {
    if (!i18n.LANGUAGES.includes(language) || language === i18n.getLanguage()) return;
    i18n.setLanguage(language);
    i18n.localizeDocument(document);
    window.dispatchEvent(new Event('agentpaw:language'));
  };
  let revision = 0;
  if (window.pet.onLanguage) window.pet.onLanguage(language => { revision++; apply(language); });
  // The window can finish loading after a language change has already broadcast.
  const initialRevision = revision;
  if (window.pet.getLanguage) window.pet.getLanguage().then(language => {
    if (revision === initialRevision) apply(language);
  }).catch(() => {});
})();
