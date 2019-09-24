import { TAPi18n, TAPi18next } from 'meteor/rocketchat:tap-i18n';

import { useReactiveValue } from './useReactiveValue';

const translator = (key, ...replaces) => {
	if (typeof replaces[0] === 'object') {
		const [options, lang_tag] = replaces;
		return TAPi18next.t(key, {
			ns: 'project',
			lng: lang_tag,
			...options,
		});
	}

	if (replaces.length === 0) {
		return TAPi18next.t(key, { ns: 'project' });
	}

	return TAPi18next.t(key, {
		postProcess: 'sprintf',
		sprintf: replaces,
		ns: 'project',
	});
};

translator.exists = (key, options) => TAPi18next.exists(key, options);

export const useTranslation = () => {
	useReactiveValue(() => TAPi18n.getLanguage());

	return translator;
};
