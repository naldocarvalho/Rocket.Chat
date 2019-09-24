/* eslint-disable new-cap */
/* eslint-disable complexity */
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Random } from 'meteor/random';
import { TAPi18n } from 'meteor/rocketchat:tap-i18n';
import React, { useEffect, useState } from 'react';
import _ from 'underscore';
import s from 'underscore.string';

import { useAdminSidebar } from '../useAdminSidebar';
import { useReactiveValue } from '../../../hooks/useReactiveValue';
import { settings } from '../../../../app/settings/lib/settings';
import { PrivateSettingsCachedCollection } from '../../../../app/ui-admin/client/SettingsCachedCollection';
import { Header } from '../../header/Header';
import { useTranslation } from '../../../hooks/useTranslation';
import { Button } from '../../basic/Button';
import { useAtLeastOnePermission } from '../../../hooks/usePermissions';
import { Icon } from '../../basic/Icon';
import { Markdown } from '../../../../app/markdown/client';


const TempSettings = new Mongo.Collection(null);

function SettingsGroupSectionPanel({ children, name, defaultCollapsed }) {
	const [collapsed, setCollapsed] = useState(defaultCollapsed);

	const t = useTranslation();

	const handleTitleClick = () => {
		setCollapsed(!collapsed);
	};

	return <div className={['section', collapsed && 'section-collapsed'].filter(Boolean).join(' ')}>
		{name && <div className='section-title' onClick={handleTitleClick}>
			<div className='section-title-text'>{t(name)}</div>
			<div className='section-title-right'>
				<Button nude aria-label={collapsed ? t('Expand') : t('Collapse')}>
					<Icon icon={collapsed ? 'icon-angle-down' : 'icon-angle-up'} />
				</Button>
			</div>
		</div>}

		<div className='section-content border-component-color'>
			{children}
		</div>
	</div>;
}

export function AnySettingsPage({ group: groupId }) {
	useAdminSidebar();

	const t = useTranslation();

	const [selectedRooms, setSelectedRooms] = useState({});

	useEffect(() => {
		if (settings.cachedCollectionPrivate == null) {
			settings.cachedCollectionPrivate = new PrivateSettingsCachedCollection();
			settings.collectionPrivate = settings.cachedCollectionPrivate.collection;
			settings.cachedCollectionPrivate.init();
		}

		settings.collectionPrivate.find().observe({
			added: (data) => {
				if (data.type === 'roomPick') {
					setSelectedRooms({
						...selectedRooms,
						[data._id]: data.value,
					});
				}
				TempSettings.insert(data);
			},
			changed: (data) => {
				if (data.type === 'roomPick') {
					setSelectedRooms({
						...selectedRooms,
						[data._id]: data.value,
					});
				}
				TempSettings.update(data._id, data);
			},
			removed: (data) => {
				if (data.type === 'roomPick') {
					delete selectedRooms[data._id];
					setSelectedRooms(
						Object.entries(selectedRooms)
							.filter(([key]) => key !== data._id)
							.reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {})
					);
				}
				TempSettings.remove(data._id);
			},
		});
	}, []);

	const [group, sections] = useReactiveValue(() => {
		if (!settings.collectionPrivate) {
			return [];
		}

		const group = settings.collectionPrivate.findOne({
			_id: groupId,
			type: 'group',
		});

		if (!group) {
			return [];
		}

		const rcSettings = settings.collectionPrivate.find({ group: groupId }, { sort: { section: 1, sorter: 1, i18nLabel: 1 } }).fetch();

		const sectionsObject = rcSettings.reduce((sections, setting) => {
			const sectionName = setting.section || '';
			if (!sections[sectionName]) {
				sections[sectionName] = [];
			}
			sections[sectionName].push(setting);

			return sections;
		}, {});

		const sections = Object.entries(sectionsObject)
			.map(([key, value]) => ({
				name: key,
				settings: value,
			}));

		return [group, sections];
	}, [groupId]);

	const hasPermissions = useAtLeastOnePermission(['view-privileged-setting', 'edit-privileged-setting', 'manage-selected-settings']);

	if (!group) {
		// TODO
		return null;
	}

	if (!hasPermissions) {
		return <section className='page-container page-home page-static page-settings'>
			<Header rawSectionName={t(group.i18nLabel)} />
			<div className='content'>
				<p>{t('You_are_not_authorized_to_view_this_page')}</p>
			</div>
		</section>;
	}

	const sectionIsCustomOAuth = (sectionName) => /^Custom OAuth:\s.+/.test(sectionName);

	const callbackURL = (sectionName) => {
		const id = s.strRight(sectionName, 'Custom OAuth: ').toLowerCase();
		return Meteor.absoluteUrl(`_oauth/${ id }`);
	};

	const isDisabled = ({ blocked, enableQuery }) => {
		let _enableQuery;
		if (blocked) {
			return {
				disabled: 'disabled',
			};
		}
		if (enableQuery == null) {
			return {};
		}
		if (_.isString(enableQuery)) {
			_enableQuery = JSON.parse(enableQuery);
		} else {
			_enableQuery = enableQuery;
		}
		if (!_.isArray(_enableQuery)) {
			_enableQuery = [_enableQuery];
		}
		let found = 0;

		Object.keys(_enableQuery).forEach((key) => {
			const item = _enableQuery[key];
			if (TempSettings.findOne(item)) {
				found++;
			}
		});
		if (found === _enableQuery.length) {
			return {};
		}
		return {
			disabled: 'disabled',
		};
	};

	const isSettingChanged = (id) => TempSettings.findOne({
		_id: id,
	}, {
		fields: {
			changed: 1,
		},
	}).changed;

	const showResetButton = ({ _id, disableReset, readonly, type, blocked }) => {
		const setting = TempSettings.findOne({ _id }, { fields: { value: 1, packageValue: 1 } });
		return !disableReset && !readonly && type !== 'asset' && setting.value !== setting.packageValue && !blocked;
	};

	const selectedOption = (_id, val) => {
		const option = settings.collectionPrivate.findOne({ _id });
		return option && option.value === val;
	};

	const languages = () => {
		const languages = TAPi18n.getLanguages();

		const result = Object.entries(languages)
			.map(([key, language]) => ({ ...language, key: key.toLowerCase() }))
			.sort((a, b) => a.key - b.key);

		result.unshift({
			name: 'Default',
			en: 'Default',
			key: '',
		});

		return result;
	};

	const isAppLanguage = (key) => {
		const languageKey = settings.get('Language');
		return typeof languageKey === 'string' && languageKey.toLowerCase() === key;
	};

	const getColorVariable = (color) => color.replace(/theme-color-/, '@');

	const hasChanges = (section) => {
		const query = {
			group: groupId,
			changed: true,
		};
		if (section != null) {
			if (section === '') {
				query.$or = [
					{
						section: '',
					}, {
						section: {
							$exists: false,
						},
					},
				];
			} else {
				query.section = section;
			}
		}
		return TempSettings.find(query).count() > 0;
	};

	const random = () => Random.id();

	const assetAccept = (fileConstraints) => {
		if (fileConstraints.extensions && fileConstraints.extensions.length) {
			return `.${ fileConstraints.extensions.join(', .') }`;
		}
	};

	const RocketChatMarkdownUnescape = (text) => Markdown.parseNotEscaped(text);

	return <section className='page-container page-home page-static page-settings'>
		<Header rawSectionName={t(group.i18nLabel)}>
			<Header.ButtonSection>
				{hasChanges() && <Button cancel className='discard'>{t('Cancel')}</Button>}
				<Button primary disabled={!hasChanges()} className='save'>{t('Save_changes')}</Button>
				{group._id === 'OAuth' && <>
					<Button secondary className='refresh-oauth'>{t('Refresh_oauth_services')}</Button>
					<Button secondary className='add-custom-oauth'>{t('Add_custom_oauth')}</Button>
				</>}
				{group._id === 'Assets' && <>
					<Button secondary className='refresh-clients'>{t('Apply_and_refresh_all_clients')}</Button>
				</>}
			</Header.ButtonSection>
		</Header>

		<div className='content'>
			{t.exists(group.i18nDescription) && <div className='info'>
				<p className='settings-description'>{t(group.i18nDescription)}</p>
			</div>}

			<div className='page-settings rocket-form'>
				{sections.map(({ name: sectionName, settings }) => <SettingsGroupSectionPanel key={sectionName} name={sectionName} defaultCollapsed={!!sectionName}>
					{sectionName && sectionIsCustomOAuth(sectionName) && <div className='section-helper' dangerouslySetInnerHTML={{ __html: t('Custom_oauth_helper', callbackURL(sectionName)) }} />}

					{settings.map(({ _id, blocked, enableQuery, i18nLabel, label, disableReset, readonly, type, multiline, value, placeholder, autocomplete, values, editor, allowedTypes, actionText, fileConstraints, description, alert }) =>
						<div key={_id} className={['input-line', 'double-col', isSettingChanged(_id) && 'setting-changed'].filter(Boolean).join(' ')} {...isDisabled({ blocked, enableQuery })}>
							<label className='setting-label' title={_id}>{(i18nLabel && t(i18nLabel)) || (_id || t(_id))}</label>
							<div className='setting-field'>
								{type === 'string' && (
									multiline
										? <textarea className='input-monitor rc-input__element' name={_id} rows='4' style={{ height: 'auto' }} {...isDisabled({ blocked, enableQuery })} readOnly={readonly} defaultValue={value} />
										: <input className='input-monitor rc-input__element' type='text' name={_id} value={value} placeholder={placeholder} {...isDisabled({ blocked, enableQuery })} readOnly={readonly} autoComplete={autocomplete === false ? 'off' : undefined} />
								)}

								{type === 'relativeUrl'
										&& <input className='input-monitor rc-input__element' type='text' name={_id} value={Meteor.absoluteUrl(value)} placeholder={placeholder} {...isDisabled({ blocked, enableQuery })} readOnly={readonly} autoComplete={autocomplete === false ? 'off' : undefined} />}

								{type === 'password'
										&& <input className='input-monitor rc-input__element' type='password' name={_id} value={value} placeholder={placeholder} {...isDisabled({ blocked, enableQuery })} readOnly={readonly} autoComplete={autocomplete === false ? 'off' : undefined} />}

								{type === 'int'
										&& <input className='input-monitor rc-input__element' type='number' name={_id} value={value} placeholder={placeholder} {...isDisabled({ blocked, enableQuery })} readOnly={readonly} autoComplete={autocomplete === false ? 'off' : undefined} />}

								{type === 'boolean' && <>
										<label>
											<input className='input-monitor' type='radio' name={_id} value='1' checked={value === true} {...isDisabled({ blocked, enableQuery })} readOnly={readonly} autoComplete={autocomplete === false ? 'off' : undefined} /> {t('True')}
										</label>
										<label>
											<input className='input-monitor' type='radio' name={_id} value='0' checked={value === false} {...isDisabled({ blocked, enableQuery })} readOnly={readonly} autoComplete={autocomplete === false ? 'off' : undefined} /> {t('False')}
										</label>
									</>}

								{type === 'select'
										&& <div className='rc-select'>
											<select className='input-monitor rc-select__element' name={_id} {...isDisabled({ blocked, enableQuery })} readOnly={readonly}>
												{values.map(({ key, i18nLabel }) =>
													<option key={key} value={key} selected={selectedOption(_id, key)}>{t(i18nLabel)}</option>
												)}
											</select>
											<Icon block='rc-select__arrow' icon='arrow-down' />
										</div>}

								{type === 'language'
										&& <div className='rc-select'>
											<select className='input-monitor rc-select__element' name={_id} {...isDisabled({ blocked, enableQuery })} readOnly={readonly}>
												{languages().map(({ key, name }) =>
													<option key={key} value={key} selected={isAppLanguage(key)} dir='auto'>{name}</option>
												)}
											</select>
											<Icon block='rc-select__arrow' icon='arrow-down' />
										</div>}

								{type === 'color' && <>
										<div className='horizontal'>
											{editor === 'color'
												&& <div className='flex-grow-1'>
													<input className='input-monitor rc-input__element colorpicker-input' type='text' name={_id} value={value} autocomplete='off' {...isDisabled({ blocked, enableQuery })}/>
													<span className='colorpicker-swatch border-component-color' style={{ backgroundColor: value }} />
												</div>}
											{editor === 'expression'
												&& <div className='flex-grow-1'>
													<input className='input-monitor rc-input__element' type='text' name={_id} value={value} {...isDisabled({ blocked, enableQuery })} autoComplete={autocomplete === false ? 'off' : undefined} />
												</div>}
											<div className='color-editor'>
												<select name='color-editor'>
													{allowedTypes && allowedTypes.map((allowedType) =>
														<option key={allowedType} value={allowedType} selected={editor === allowedType}>{t(allowedType)}</option>
													)}
												</select>
											</div>
										</div>
										<div className='settings-description'>Variable name: {getColorVariable(_id)}</div>
									</>}

								{type === 'font'
										&& <input className='input-monitor rc-input__element' type='text' name={_id} value={value} {...isDisabled({ blocked, enableQuery })} autoComplete={autocomplete === false ? 'off' : undefined} />}

								{type === 'code' && (
									isDisabled({ blocked, enableQuery }).disabled
										? <>{/* {> CodeMirror name=_id options=(getEditorOptions true) code=(i18nDefaultValue) }*/}</>
										: <div className='code-mirror-box' data-editor-id={_id}>
											<div className='title'>{label}</div>
											{/* {> CodeMirror name=_id options=getEditorOptions code=value editorOnBlur=setEditorOnBlur}*/}

											<div className='buttons'>
												<Button primary className='button-fullscreen'>{t('Full_Screen')}</Button>
												<Button primary className='button-restore'>{t('Exit_Full_Screen')}</Button>
											</div>
										</div>
								)}

								{type === 'action' && (
									hasChanges(name)
										? <span style={{ lineHeight: '40px' }} className='secondary-font-color'>{t('Save_to_enable_this_action')}</span>
										: <Button primary className='action' data-setting={_id} data-action={value} {...isDisabled({ blocked, enableQuery })}>{t(actionText)}</Button>
								)}

								{type === 'asset' && (
									value.url
										? <div className='settings-file-preview'>
											<div className='preview' style={{ backgroundImage: `url(${ value.url }?_dc=${ random })` }} />
											<div className='action'>
												<Button className='rc-button rc-button--cancel delete-asset'>
													<Icon icon='icon-trash' />{t('Delete')}
												</Button>
											</div>
										</div>
										: <div className='settings-file-preview'>
											<div className='preview no-file background-transparent-light secondary-font-color'><Icon icon='icon-upload' /></div>
											<div className='action'>
												<div className='rc-button rc-button--primary'>{t('Select_file')}
													<input type='file' accept={assetAccept(fileConstraints)} />
												</div>
											</div>
										</div>)}

								{type === 'roomPick'
										&& <div>
											{/* {{> inputAutocomplete settings=autocompleteRoom id=_id name=_id class="search autocomplete rc-input__element" autocomplete="off" disabled=isDisabled.disabled}} */}
											<ul class='selected-rooms'>
												{(selectedRooms[_id] || []).map(({ name }) =>
													<li key={name} className='remove-room' data-setting={_id}>{name} <Icon icon='icon-cancel' /></li>
												)}
											</ul>
										</div>}

								{description
										&& <div className='settings-description secondary-font-color' dangerouslySetInnerHTML={{ __html: RocketChatMarkdownUnescape(description) }} />}

								{alert
										&& <div className='settings-alert pending-color pending-background pending-border'><Icon icon='icon-attention' /><span dangerouslySetInnerHTML={{ __html: t(alert) }} /></div>}
							</div>

							{showResetButton({ _id, disableReset, readonly, type, blocked })
									&& <Button aria-label={t('Reset')} data-setting={_id} cancel className='reset-setting'>
										<Icon icon='icon-ccw' className='color-error-contrast' />
									</Button>}
						</div>
					)}

					{group._id !== 'Assets' && <div className='input-line double-col'>
						<label className='setting-label'>{t('Reset_section_settings')}</label>
						<div className='setting-field'>
							<Button cancel data-section={sectionName} className='reset-group'>
								{t('Reset')}
							</Button>
						</div>
					</div>}

					{sectionName && sectionIsCustomOAuth(sectionName) && <div className='submit'>
						<Button cancel className='remove-custom-oauth'>{t('Remove_custom_oauth')}</Button>
					</div>}
				</SettingsGroupSectionPanel>)}
			</div>
		</div>
	</section>;
}
