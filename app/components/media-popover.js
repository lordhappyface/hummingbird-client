import Component from 'ember-component';
import service from 'ember-service/inject';
import get from 'ember-metal/get';
import set from 'ember-metal/set';
import { addObserver, removeObserver } from 'ember-metal/observer';
/* global hoverintent */

export default Component.extend({
  cache: service('local-cache'),
  store: service(),

  didInsertElement() {
    this._super(...arguments);
    const element = get(this, 'element');
    hoverintent(element, () => {
      this._onMouseEnter();
    }, () => {
      this._onMouseLeave();
    }).options({ timeout: 250 });
  },

  willDestroyElement() {
    this._super(...arguments);
    this.$().off('mouseenter.hoverIntent');
  },

  /**
   * Called by hoverIntent when the user hovers this component
   */
  _onMouseEnter() {
    if (get(this, 'isDestroyed') || get(this, 'isDestroying')) { return; }
    this._getLibraryEntry();
    set(this, 'showTooltip', true);
    set(this, 'isTooltipHovered', false);
  },

  /**
   * Called by hoverIntent when the user's mouse leaves this component
   */
  _onMouseLeave() {
    if (get(this, 'isDestroying') || get(this, 'isDestroyed')) { return; }
    // We don't want to close the tooltip if the tooltip itself is hovered.
    // The tooltip communicates that to us via the onHover/onLeave actions
    if (get(this, 'isTooltipHovered')) {
      // tooltip is currently hovered, so observe the variable and exit after
      addObserver(this, 'isTooltipHovered', this._onMouseLeave);
    } else {
      removeObserver(this, 'isTooltipHovered', this._onMouseLeave);
      set(this, 'showTooltip', false);
    }
  },

  _getLibraryEntry() {
    // user isn't logged in.
    if (!get(this, 'session.hasUser')) {
      return;
    }

    // check if we already have this entry in store.
    const entry = this._checkLocalStore();
    if (entry) {
      set(this, 'entry', entry);
    } else {
      this._requestLibraryEntry();
    }
  },

  _checkLocalStore() {
    const mediaId = get(this, 'media.id');
    const mediaType = get(this, 'media.modelType');
    const lookupKey = `${mediaType}-${mediaId}`;
    const id = get(this, 'cache').getFromCache('library-entry', lookupKey);
    return get(this, 'store').peekRecord('library-entry', id);
  },

  _requestLibraryEntry() {
    const media = get(this, 'media');
    const type = get(media, 'modelType');
    const promise = get(this, 'store').query('library-entry', {
      filter: {
        kind: type,
        [`${type}_id`]: get(media, 'id'),
        user_id: get(this, 'session.account.id')
      }
    }).then((results) => {
      if (get(this, 'isDestroying') || get(this, 'isDestroyed')) { return; }
      const entry = get(results, 'firstObject');
      set(this, 'entry', entry);
      if (entry !== undefined) {
        set(this, `entry.${type}`, media);
        this._addToStore();
      }
    });
    set(this, 'entry', promise);
  },

  _addToStore() {
    const type = get(this, 'media.modelType');
    const id = get(this, 'media.id');
    const lookupKey = `${type}-${id}`;
    const entryId = get(this, 'entry.id');
    get(this, 'cache').addToCache('library-entry', lookupKey, entryId);
  },

  actions: {
    createEntry(status) {
      const user = get(this, 'session.account');
      const type = get(this, 'media.modelType');
      const entry = get(this, 'store').createRecord('library-entry', {
        status,
        user,
        [type]: get(this, 'media')
      });
      return entry.save().then(() => {
        set(this, 'entry', entry);
        this._addToStore();
      });
    },

    updateEntry(status) {
      set(this, 'entry.status', status);
      return get(this, 'entry').save().catch(() => {
        get(this, 'entry').rollbackAttributes();
      });
    },

    deleteEntry() {
      return get(this, 'entry').destroyRecord().then(() => {
        set(this, 'entry', undefined);
      }).catch(() => {
        get(this, 'entry').rollbackAttributes();
      });
    }
  }
});
