// ==========================================================================
// Project:   SproutCore - JavaScript Application Framework
// Copyright: ©2014 7x7 Software Inc. All rights reserved.
//            Portions ©2008-2011 Apple Inc. All rights reserved.
// License:   Licensed under MIT license (see license.js)
// ==========================================================================
sc_require('views/scroller');


SC.SCROLL = {

  /**
    The rate of deceleration in pixels per square millisecond after scrolling from a drag gesture.

    @static
    @type Number
    @default 3.0
  */
  DRAG_SCROLL_DECELERATION: 3.0,

  /**
    The number of pixels a gesture needs to move before it should be considered a scroll gesture.

    @static
    @type Number
    @default 5
  */
  SCROLL_GESTURE_THRESHOLD: 5,

  /**
    The number of pixels a gesture needs to expand or contract before it should be considered a scale gesture.

    @static
    @type Number
    @default 5
  */
  SCALE_GESTURE_THRESHOLD: 3,

  TOUCH: {
    DEFAULT_SECONDARY_SCROLL_THRESHOLD: 50,
    DEFAULT_SECONDARY_SCROLL_LOCK: 500
  }
};


/** @class
  Implements a complete scroll view. SproutCore implements its own JS-based scrolling in order
  to unify scrolling behavior across platforms, and to enable progressive rendering (via the
  clipping frame) during scroll on all devices.

  Important Properties
  -----

  ScrollView positions its contentView according to three properties: `verticalScrollOffset`,
  `horizontalScrollOffset`, and `scale`. These properties are bindable and observable, but you
  should not override them.

  Gutter vs. Overlaid Scrollers
  -----

  Scroll views use swappable scroll-bar views with various behavior (see `verticalScrollerView`
  and `horizontalScrollerView`). `SC.ScrollerView` is a gutter-based scroller which persists and
  takes up fourteen pixels. (By default, no scroller is shown for content that is too small to
  scroll; see `autohidesHorizontalScroller` and `autohidesVerticalScroller`.) `SC.OverlayScrollerView`
  is a gutterless view which fades when not scrolling. If you would like your view to always have
  OS X-style fading overlaid scrollers, you can use the following:

        SC.ScrollView.extend({
          horizontalOverlay: true,
          verticalOverlay: true
        });

  @extends SC.View
  @since SproutCore 1.0
*/
SC.ScrollView = SC.View.extend({
/** @scope SC.ScrollView.prototype */

  // ---------------------------------------------------------------------------------------------
  // Properties
  //

  /** @private Shared object used to avoid continually initializing/destroying objects. */
  _SC_CONTAINER_LAYOUT_MAP: null,

  /** @private Flag used to determine whether to animate the adjustment. */
  _sc_animationDuration: null,

  /** @private The animation timing to use. */
  _sc_animationTiming: null,

  /** @private The cached height of the container. */
  _sc_containerHeight: 0,

  /** @private The cached width of the container. */
  _sc_containerWidth: 0,

  /** @private The cached height of the content. */
  _sc_contentHeight: 0,

  /** @private The current frame of the content view, used to determine if the size of the content view changes (vs. just its position). */
  // _sc_contentViewFrame: null,

  /** @private The cached width of the content. */
  _sc_contentWidth: 0,

  /** @private The anchor position of the touch gesture. */
  _sc_gestureAnchorX: null,

  /** @private The anchor position of the touch gesture. */
  _sc_gestureAnchorY: null,

  /** @private The anchor distance from center of the touch gesture. */
  _sc_gestureAnchorD: null,

  /** @private The timer used to fade out this scroller. */
  _sc_horizontalFadeOutTimer: null,

  /** @private The actual horizontal scroll offset. */
  _sc_horizontalScrollOffset: null,

  /** @private Flag is true when scaling. Used in capturing touches. */
  _sc_isTouchScaling: false,

  /** @private Flag is true when scrolling horizontally. Used in capturing touches. */
  _sc_isTouchScrollingH: false,

  /** @private Flag is true when scrolling vertically. Used in capturing touches. */
  _sc_isTouchScrollingV: false,

  /** @private The amount of slip while over dragging (drag past bounds). 1.0 or 100% would slip completely, and 0.0 or 0% would not slip at all.  */
  _sc_overDragSlip: 0.5,

  /** @private Timer used to pass a touch through to its content if we don't start scrolling in that time. */
  _sc_passTouchToContentTimer: null,

  /** @private The actual scale. */
  _sc_scale: null,

  /** @private Flag used to indicate when we should resize the content width manually. */
  _sc_shouldResizeContentWidth: false,

  /** @private Flag used to indicate when we should resize the content height manually. */
  _sc_shouldResizeContentHeight: false,

  /** @private The minimum delay before applying a fade transition. */
  _sc_minimumFadeOutDelay: function () {
    // The fade out delay is never less than 100ms (so that the current run loop can complete) and is never less than the fade in duration (so that it can fade fully in).
    return Math.max(Math.max(this.get('fadeOutDelay') || 0, 0.1), this.get('fadeInDuration') || 0) * 1000;
  }.property('fadeOutDelay').cacheable(),

  /** @private The timer used to fade out this scroller. */
  _sc_verticalFadeOutTimer: null,

  /** @private The actual vertical scroll offset. */
  _sc_verticalScrollOffset: null,

  /** @see SC.View.prototype.acceptsMultitouch

    @type Boolean
    @default true
  */
  acceptsMultitouch: true,

  /** @private Animation curves. Kept private b/c it will likely become a computed property. */
  animationCurveDecelerate: 'cubic-bezier(.35,.34,.84,1)',  // http://cubic-bezier.com

  /** @private Animation curves. Kept private b/c it will likely become a computed property. */
  animationCurveReverse: 'cubic-bezier(0.45,-0.47,0.73,1.3)',

  /** @private Animation curves. Kept private b/c it will likely become a computed property. */
  animationCurveSnap: 'cubic-bezier(.28,.36,.52,1)',

  /**
    If true, the horizontal scroller will automatically hide if the contentView is smaller than the
    visible area.  The `hasHorizontalScroller` property must be set to true in order for this property
    to have any effect.

    @type Boolean
    @default true
  */
  autohidesHorizontalScroller: true,

  /**
    If true, the vertical scroller will automatically hide if the contentView is smaller than the
    visible area.  The `hasVerticalScroller` property must be set to true in order for this property
    to have any effect.

    @type Boolean
    @default true
  */
  autohidesVerticalScroller: true,

  /**
    Determines whether scaling is allowed.

    @type Boolean
    @default false
  */
  canScale: false,

  /**
    Returns true if the view has both a horizontal scroller and the scroller is visible.

    @field
    @type Boolean
    @readonly
  */
  canScrollHorizontal: function () {
    return !!(this.get('hasHorizontalScroller') && // This property isn't bindable.
      this.get('horizontalScrollerView') && // This property isn't bindable.
      this.get('isHorizontalScrollerVisible'));
  }.property('isHorizontalScrollerVisible').cacheable(),

  /**
    Returns true if the view has both a vertical scroller and the scroller is visible.

    @field
    @type Boolean
    @readonly
  */
  canScrollVertical: function () {
    return !!(this.get('hasVerticalScroller') && // This property isn't bindable.
      this.get('verticalScrollerView') && // This property isn't bindable.
      this.get('isVerticalScrollerVisible'));
  }.property('isVerticalScrollerVisible').cacheable(),

  /**
    @type Array
    @default ['sc-scroll-view']
    @see SC.View#classNames
  */
  classNames: ['sc-scroll-view'],

  /**
    The container view that will wrap your content view.  You can replace this property with your own
    custom class if you prefer.

    @type SC.ContainerView
    @default SC.ContainerView
  */
  containerView: SC.ContainerView,

  /**
    The content view you want the scroll view to manage.

    @type SC.View
    @default null
  */
  contentView: null,

  /**
    The scroll deceleration rate.

    @type Number
    @default SC.SCROLL.DRAG_SCROLL_DECELERATION
  */
  decelerationRate: SC.SCROLL.DRAG_SCROLL_DECELERATION,

  /** @private
    Whether to delay touches from passing through to the content. By default, if the touch moves enough to
    trigger a scroll within 150ms, this view will retain control of the touch, and content views will not
    have a chance to handle it. This is generally the behavior you want.

    If you set this to NO, the touch will not trigger a scroll until you pass control back to this view via
    `touch.restoreLastTouchResponder`, for example when the touch has dragged by a certain amount. You should
    use this option only if you know what you're doing.

    @type Boolean
    @default true
  */
  delaysContentTouches: true,

  /**
    Determines how long (in seconds) scrollbars wait before fading out.

    @property Number
    @default 0.4
   */
  fadeOutDelay: 0.4,

  /**
    True if the view should maintain a horizontal scroller.   This property must be set when the
    view is created.

    @type Boolean
    @default true
  */
  hasHorizontalScroller: true,

  /**
    True if the view should maintain a vertical scroller.   This property must be set when the
    view is created.

    @type Boolean
    @default true
  */
  hasVerticalScroller: true,

  /**
    The horizontal alignment for non-filling content inside of the ScrollView. Possible values:

      - SC.ALIGN_LEFT
      - SC.ALIGN_RIGHT
      - SC.ALIGN_CENTER

    @type String
    @default SC.ALIGN_LEFT
  */
  horizontalAlign: SC.ALIGN_LEFT,

  /**
    Determines whether the horizontal scroller should fade out while in overlay mode. Has no effect
    if `horizontalOverlay` is set to false.

    @property Boolean
    @default true
   */
  horizontalFade: true,

  /**
    Amount to scroll one horizontal line.

    Used by the default implementation of scrollLeftLine() and
    scrollRightLine().

    @type Number
    @default 20
  */
  horizontalLineScroll: 20,

  /**
    Use this to overlay the horizontal scroller.

    This ensures that the content container will not resize to accommodate the horizontal scroller,
    hence overlaying the scroller on top of the container.

    @field
    @type Boolean
    @default true
  */
  horizontalOverlay: false,

  /**
    Amount to scroll one horizontal page.

    Used by the default implementation of scrollLeftPage() and scrollRightPage().

    @field
    @type Number
    @default value of frame.width
    @observes frame
  */
  horizontalPageScroll: function () {
    return this.get('frame').width;
  }.property('frame'),

  /**
    The current horizontal scroll offset. Changing this value will update both the position of the
    contentView and the horizontal scroller, if there is one.

    @field
    @type Number
    @default 0
  */
  horizontalScrollOffset: function (key, value) {
    var containerWidth = this._sc_containerWidth,
        min = this.get('minimumHorizontalScrollOffset'),
        max = this.get('maximumHorizontalScrollOffset');

    /* jshint eqnull:true */
    if (value != null) {
      // When touch scrolling, we allow scroll to pass the limits by a small amount.
      if (!this._sc_isTouchScrollingH) {
        // Constrain to the set limits.\
        value = Math.max(min, Math.min(max, value));
      }

      // Record the relative percentage offset for maintaining position while scaling.
      if (value) {
        this._sc_horizontalPct = (value + (containerWidth / 2)) / (max + containerWidth);
      }

    // Use the cached value.
    } else {
      value = this._sc_horizontalScrollOffset;

      // Default value.
      if (value == null) { // || maxOffset === 0) {
        var horizontalAlign = this.get('initialHorizontalAlign');

        value = this._sc_alignedHorizontalOffset(horizontalAlign, containerWidth, this._sc_contentWidth);
      }
    }

    // Update the actual value.
    this._sc_horizontalScrollOffset = value;

    return value;
  }.property().cacheable(), //'minimumHorizontalScrollOffset', 'maximumHorizontalScrollOffset', 'horizontalAlign'
  // Note that the properties above don't trigger a recalculation, as calculation is only done during setting. Instead,
  // it invalidates the last-set value so that setting it again will actually do something.

  /**
    Use to control the positioning of the horizontal scroller. If you do not set 'horizontalOverlay' to
    true, then the content view will be automatically sized to meet the left edge of the vertical
    scroller, wherever it may be.

    This allows you to easily, for example, have “one pixel higher and one pixel lower” scroll bars
    that blend into their parent views.

    If you do set 'horizontalOverlay' to true, then the scroller view will “float on top” of the content view.

    Example: { left: -1, bottom: 0, right: -1 }

    @type Object
    @default null
  */
  horizontalScrollerLayout: null,

  /**
    The horizontal scroller view class. This will be replaced with a view instance when the
    ScrollView is created unless `hasHorizontalScroller` is false.

    If `horizontalOverlay` is `true`, the default view used will be an SC.OverlayScrollerView,
    otherwise SC.ScrollerView will be used.

    @type SC.View
    @default SC.ScrollerView | SC.OverlayScrollerView
  */
  horizontalScrollerView: null,

  /**
    Your content view's initial horizontal alignment, if wider than the container. This allows you to e.g.
    center the content view when zoomed out, but begin with it zoomed in and left-aligned. If not specified,
    defaults to value of `horizontalAlign`. May be:

      - SC.ALIGN_LEFT
      - SC.ALIGN_RIGHT
      - SC.ALIGN_CENTER

    @type String
    @default SC.ALIGN_LEFT
  */
  initialHorizontalAlign: SC.outlet('horizontalAlign'),

  /**
    Your content view's initial vertical alignment, if taller than the container. This allows you to e.g.
    center the content view when zoomed out, but begin with it zoomed in and top-aligned. If not specified,
    defaults to the value of `verticalAlign`. May be:

      - SC.ALIGN_TOP
      - SC.ALIGN_BOTTOM
      - SC.ALIGN_MIDDLE

    @type String
    @default SC.ALIGN_TOP
  */
  initialVerticalAlign: SC.outlet('verticalAlign'),

  /**
    True if the horizontal scroller should be visible. You can change this property value anytime to
    show or hide the horizontal scroller.  If you do not want to use a horizontal scroller at all, you
    should instead set `hasHorizontalScroller` to false to avoid creating a scroller view in the first
    place.

    @type Boolean
    @default true
  */
  isHorizontalScrollerVisible: true,

  /**
    Walk like a duck.

    @type Boolean
    @default true
    @readOnly
  */
  isScrollable: true,

  /**
    True if the vertical scroller should be visible. You can change this property value anytime to
    show or hide the vertical scroller.  If you do not want to use a vertical scroller at all, you
    should instead set `hasVerticalScroller` to false to avoid creating a scroller view in the first
    place.

    @type Boolean
    @default true
  */
  isVerticalScrollerVisible: true,

  /**
    The maximum horizontal scroll offset allowed given the current contentView size and the size of
    the scroll view.  If horizontal scrolling is disabled, this will always return 0.

    @field
    @type Number
    @default 0
  */
  maximumHorizontalScrollOffset: function () {
    return Math.max(this._sc_contentWidth - this._sc_containerWidth, 0);
  }.property('_sc_containerWidth', '_sc_contentWidth').cacheable(),

  /**
    The maximum scale.

    @type Number
    @default 2.0
  */
  maximumScale: 2.0,

  /**
    The maximum vertical scroll offset allowed given the current contentView size and the size of
    the scroll view.  If vertical scrolling is disabled, this will always return 0 (or whatever
    alignment dictates).

    @field
    @type Number
    @default 0
  */
  maximumVerticalScrollOffset: function () {
    return Math.max(this._sc_contentHeight - this._sc_containerHeight, 0);
  }.property('_sc_containerHeight', '_sc_contentHeight').cacheable(),

  /**
    The minimum horizontal scroll offset allowed given the current contentView size and the size of
    the scroll view.  If horizontal scrolling is disabled, this will always return 0 (or whatever alignment dictates).

    @field
    @type Number
    @default 0
  */
  minimumHorizontalScrollOffset: function () {
    return Math.min(this._sc_contentWidth - this._sc_containerWidth, 0);
  }.property('_sc_containerWidth', '_sc_contentWidth').cacheable(),

  /**
    The minimum scale.

    @type Number
    @default 0.25
  */
  minimumScale: 0.25,

  /**
    The minimum vertical scroll offset allowed given the current contentView size and the size of
    the scroll view.  If vertical scrolling is disabled, this will always return 0 (or whatever alignment dictates).

    @field
    @type Number
    @default 0
  */
  minimumVerticalScrollOffset: function () {
    return Math.min(this._sc_contentHeight - this._sc_containerHeight, 0);
  }.property('_sc_containerHeight', '_sc_contentHeight').cacheable(),

  /**
    The current scale. Setting this will adjust the scale of the contentView.

    If the contentView implements the SC.Scalable protocol, it will instead pass the scale to the contentView's
    `applyScale` method instead.

    Note that on platforms that allow bounce, setting scale outside of the minimum/maximumScale bounds will
    result in a bounce. It is up to the developer to alert this view when the action is over and it should
    bounce back.

    @field
    @type Number
    @default 1.0
  */
  scale: function (key, value) {
    /* jshint eqnull:true */
    if (value != null) {
      if (!this.get('canScale')) {
        value = 1;
      } else {
        var min = this.get('minimumScale'),
          max = this.get('maximumScale');

        // When touch scaling, we allow scaling to pass the limits by a small amount.
        if (this._sc_isTouchScaling) {
          min = min - (min * 0.1);
          max = max + (max * 0.1);
          if ((value < min || value > max)) {
            value = Math.min(Math.max(min, value), max);
          }

        // Constrain to the set limits.
        } else {
          if ((value < min || value > max)) {
            value = Math.min(Math.max(min, value), max);
          }
        }
      }
    } else {
      value = this._sc_scale;

      // Default value.
      if (value == null) {
        value = 1;
      }
    }

    // Update the actual value.
    this._sc_scale = value;

    return value;
  }.property('canScale', 'minimumScale', 'maximumScale').cacheable(),

  /**
    This determines how much a gesture must pinch or spread apart (in pixels) before it is registered as a scale action.

    You can change this value for all instances of SC.ScrollView in your application by overriding
    `SC.SCROLL.SCALE_GESTURE_THRESHOLD` at launch time.

    @type Number
    @default SC.SCROLL.SCALE_GESTURE_THRESHOLD
  */
  scaleGestureThreshold: SC.SCROLL.SCALE_GESTURE_THRESHOLD,

  /**
    This determines how far (in pixels) a gesture must move before it is registered as a scroll.

    You can change this value for all instances of SC.ScrollView in your application by overriding
    `SC.SCROLL.SCROLL_THRESHOLD` at launch time.

    @type Number
    @default SC.SCROLL.SCROLL_GESTURE_THRESHOLD
  */
  scrollGestureThreshold: SC.SCROLL.SCROLL_GESTURE_THRESHOLD,

  /**
    Once a vertical or horizontal scroll has been triggered, this determines how far (in pixels) the gesture
    must move on the other axis to trigger a two-axis scroll. If your scroll view's content is omnidirectional
    (e.g. a map) you should set this value to 0.

    You can change this value for all instances of SC.ScrollView in your application by overriding
    `SC.SCROLL.TOUCH.DEFAULT_SECONDARY_SCROLL_LOCK` at launch time.

    @type Number
    @default SC.SCROLL.TOUCH.DEFAULT_SECONDARY_SCROLL_LOCK
  */
  // touchSecondaryScrollLock: SC.SCROLL.TOUCH.DEFAULT_SECONDARY_SCROLL_LOCK,

  /**
    Once a vertical or horizontal scroll has been triggered, this determines how far (in pixels) the gesture
    must move on the other axis to trigger a two-axis scroll. If your scroll view's content is omnidirectional
    (e.g. a map) you should set this value to 0.

    You can change this value for all instances of SC.ScrollView in your application by overriding
    `SC.SCROLL.TOUCH.DEFAULT_SECONDARY_SCROLL_THRESHOLD` at launch time.

    @type Number
    @default SC.SCROLL.TOUCH.DEFAULT_SECONDARY_SCROLL_THRESHOLD
  */
  // touchSecondaryScrollThreshold: SC.SCROLL.TOUCH.DEFAULT_SECONDARY_SCROLL_THRESHOLD,

  /**
    The vertical alignment for non-filling content inside of the ScrollView. Possible values:

      - SC.ALIGN_TOP
      - SC.ALIGN_BOTTOM
      - SC.ALIGN_MIDDLE

    @type String
    @default SC.ALIGN_TOP
  */
  verticalAlign: SC.ALIGN_TOP,

  /**
    Determines whether the vertical scroller should fade out while in overlay mode. Has no effect if
    `verticalOverlay` is set to false.

    @property Boolean
    @default true
   */
  verticalFade: true,

  /**
    Amount to scroll one vertical line.

    Used by the default implementation of scrollDownLine() and scrollUpLine().

    @type Number
    @default 20
  */
  verticalLineScroll: 20,

  /**
    Use this to overlay the vertical scroller.

    This ensures that the content container will not resize to accommodate the vertical scroller,
    hence overlaying the scroller on top of the container.

    @field
    @type Boolean
    @default true
  */
  verticalOverlay: false,

  /**
    Amount to scroll one vertical page.

    Used by the default implementation of scrollUpPage() and scrollDownPage().

    @field
    @type Number
    @default value of frame.height
    @observes frame
  */
  verticalPageScroll: function () {
    return this.get('frame').height;
  }.property('frame'),

  /**
    The current vertical scroll offset. Changing this value will update both the position of the
    contentView and the vertical scroller, if there is one.

    @field
    @type Number
    @default 0
  */
  verticalScrollOffset: function (key, value) {
    var containerHeight = this._sc_containerHeight,
      min = this.get('minimumVerticalScrollOffset'),
      max = this.get('maximumVerticalScrollOffset');

    /* jshint eqnull:true */
    if (value != null) {

      // When touch scrolling, we allow scroll to pass the limits by a small amount.
      if (!this._sc_isTouchScrollingV) {
        // Constrain to the set limits.
        value = Math.max(min, Math.min(max, value));
      }

      // Record the relative percentage offset for maintaining position while scaling.
      if (value) {
        this._sc_verticalPct = (value + (containerHeight / 2)) / (max + containerHeight);
      }

    // Use the cached value.
    } else {
      value = this._sc_verticalScrollOffset;

      // Default value.
      if (value == null) {
        var verticalAlign = this.get('initialVerticalAlign');

        value = this._sc_alignedVerticalOffset(verticalAlign, containerHeight, this._sc_contentHeight);
      }
    }

    // Update the actual value.
    this._sc_verticalScrollOffset = value;

    return value;
  }.property().cacheable(), // 'minimumVerticalScrollOffset', 'maximumVerticalScrollOffset', 'verticalAlign'
  // Note that the properties above don't trigger a recalculation, as calculation is only done during setting. Instead,
  // it invalidates the last-set value so that setting it again will actually do something.

  /**
    Use to control the positioning of the vertical scroller. If you do not set 'verticalOverlay' to
    true, then the content view will be automatically sized to meet the left edge of the vertical
    scroller, wherever it may be.

    This allows you to easily, for example, have “one pixel higher and one pixel lower” scroll bars
    that blend into their parent views.

    If you do set 'verticalOverlay' to true, then the scroller view will “float on top” of the content view.

    Example: { top: -1, bottom: -1, right: 0 }

    @type Object
    @default null
  */
  verticalScrollerLayout: null,

  /**
    The vertical scroller view class. This will be replaced with a view instance when the
    ScrollView is created unless `hasVerticalScroller` is false.

    If `verticalOverlay` is `true`, the default view used will be an SC.OverlayScrollerView,
    otherwise SC.ScrollerView will be used.

    @type SC.View
    @default SC.ScrollerView | SC.OverlayScrollerView
  */
  verticalScrollerView: null,

  // ---------------------------------------------------------------------------------------------
  // Methods
  //

  /** @private Aligns the content horizontally. */
  _sc_alignedHorizontalOffset: function (horizontalAlign, containerWidth, contentWidth) {
    switch (horizontalAlign) {
    case SC.ALIGN_RIGHT:
      return 0 - (containerWidth - contentWidth);
    case SC.ALIGN_CENTER:
      return 0 - ((containerWidth - contentWidth) / 2);
    default: // SC.ALIGN_LEFT
      return 0;
    }
  },

  /** @private Aligns the content vertically. */
  _sc_alignedVerticalOffset: function (verticalAlign, containerHeight, contentHeight) {
    switch (verticalAlign) {
    case SC.ALIGN_BOTTOM:
      return 0 - (containerHeight - contentHeight);
    case SC.ALIGN_MIDDLE:
      return 0 - ((containerHeight - contentHeight) / 2);
    default: // SC.ALIGN_TOP
      return 0;
    }
  },

  /* @private Cancels any content view animation if it exists. */
  _sc_cancelAnimation: function () {
    var contentView = this.get('contentView');

    if (contentView.get('viewState') === SC.CoreView.ATTACHED_SHOWN_ANIMATING) {
      // Stop the animation in place.
      contentView.cancelAnimation(SC.LayoutState.CURRENT);

      var curLayout = contentView.get('layout');

      // Update offsets to match actual placement.
      this.set('horizontalScrollOffset', -curLayout.left);
      this.set('verticalScrollOffset', -curLayout.top);
    }
  },

  /** @private Reposition our content view if necessary according to aligment. */
  _sc_containerViewFrameDidChange: function () {
    // Run the content view size change code (updates min & max offsets, sets content alignment if necessary, shows scrollers if necessary)
    var containerFrame = this.getPath('containerView.frame'),
      contentView = this.get('contentView');

    // Cache the current height and width of the container view, so we can only watch for size changes.
    this.set('_sc_containerHeight', containerFrame.height);
    this.set('_sc_containerWidth', containerFrame.width);

    if (contentView) {
      var didAdjust = false;

      if (this._sc_shouldResizeContentHeight) {
        contentView.adjust('height', containerFrame.height);
        didAdjust = true;
      }

      if (this._sc_shouldResizeContentWidth) {
        contentView.adjust('width', containerFrame.width);
        didAdjust = true;
      }

      // Ensure that the content view size did change runs none-the-less.
      if (!didAdjust) { this._sc_contentViewSizeDidChange(); }
    }

  },

  /** @private Whenever the contentView of the container changes, set up new observers and clean up old observers. */
  _sc_contentViewDidChange: function () {
    var newView = this.get('contentView'), // Our content view.
      containerView = this.get('containerView'),
      frameChangeFunc = this._sc_contentViewFrameDidChange;

    // Clean up observers on the previous content view.
    this._sc_removeContentViewObservers();

    // Reset caches.
    this._sc_shouldResizeContentWidth = false;
    this._sc_shouldResizeContentHeight = false;
    this._sc_contentHeight = 0;
    this._sc_contentWidth = 0;

    // Assign the content view to our container view. This ensures that it is instantiated.
    containerView.set('contentView', newView);
    newView = this.contentView = containerView.get('contentView'); // Actual content view.

    if (newView) {
      /* jshint eqnull:true */

      // Be wary of content views that replace their layers.
      // newView.addObserver('layer', this, layerChangeFunc);

      if (!newView.useStaticLayout) {
        // Ensure that scale transforms occur from the top-left corner (per our math).
        newView.adjust({
          transformOriginX: 0,
          transformOriginY: 0
        });

        // When a view wants an accelerated layer and isn't a fixed size, we convert it to a fixed
        // size and resize it when our container resizes.
        if (!newView.get('isFixedSize')) {
          var contentViewLayout = newView.get('layout');

          // Fix the width.
          if (contentViewLayout.width == null) {
            this._sc_shouldResizeContentWidth = true; // Flag to indicate that when the container's width changes, we should update the content's width.

            newView.adjust({
              right: null,
              width: this._sc_containerWidth
            });
          }

          // Fix the height.
          if (contentViewLayout.height == null) {
            this._sc_shouldResizeContentHeight = true; // Flag to indicate that when the container's height changes, we should update the content's height.

            newView.adjust({
              bottom: null,
              height: this._sc_containerHeight
            });
          }
        }
      }

      // TODO: Can we remove this if a calculated property exists?
      newView.addObserver('frame', this, frameChangeFunc);

      // Initialize once.
      this._sc_contentViewSizeDidChange();
    }

    // Cache the current content view so that we can properly clean up when it changes.
    this._sc_contentView = newView;
  },

  /** @private */
  // _sc_contentViewLayerDidChange: function () {
  //   ???
  // },

  /** @private Check frame changes for size changes. */
  _sc_contentViewFrameDidChange: function () {
    var lastHeight = this._sc_contentHeight,
        lastWidth = this._sc_contentWidth,
        newFrame = this.getPath('contentView.borderFrame');

    if (lastWidth !== newFrame.width) {
      this._sc_contentViewSizeDidChange();
    }

    if (lastHeight.height !== newFrame.height) {
      this._sc_contentViewSizeDidChange();
    }
  },

  /** @private When the content view's size changes, we need to update our scroll offset properties. */
  _sc_contentViewSizeDidChange: function () {
    var newFrame = this.getPath('contentView.borderFrame');

    // Cache the current sizes of the view, so we can only watch for size changes.
    this.set('_sc_contentHeight', newFrame.height);
    this.set('_sc_contentWidth', newFrame.width);

    // Filter the observer input.
    this.invokeOnce(this._sc_contentViewSizeDidChangeUnfiltered);
  },

  /** @private When the content view's size changes, we need to update our scroll offset properties. */
  _sc_contentViewSizeDidChangeUnfiltered: function () {
    var horizontalScrollerView = this.get('horizontalScrollerView'),
      verticalScrollerView = this.get('verticalScrollerView'),
      minimumHorizontalScrollOffset = this.get('minimumHorizontalScrollOffset'),
      minimumVerticalScrollOffset = this.get('minimumVerticalScrollOffset'),
      maximumHorizontalScrollOffset = this.get('maximumHorizontalScrollOffset'),
      maximumVerticalScrollOffset = this.get('maximumVerticalScrollOffset'),
      containerHeight, containerWidth,
      contentHeight, contentWidth;

    containerHeight = this._sc_containerHeight;
    containerWidth = this._sc_containerWidth;
    contentHeight = this._sc_contentHeight;
    contentWidth = this._sc_contentWidth;

    // Update the scrollers manually.
    if (this.get('hasHorizontalScroller')) {
      horizontalScrollerView.set('minimum', minimumHorizontalScrollOffset);
      horizontalScrollerView.set('maximum', maximumHorizontalScrollOffset);
    }

    if (this.get('hasVerticalScroller')) {
      verticalScrollerView.set('minimum', minimumVerticalScrollOffset);
      verticalScrollerView.set('maximum', maximumVerticalScrollOffset);
    }

    var value;
    if (maximumHorizontalScrollOffset === 0) {
      // Align horizontally.
      value = this._sc_alignedHorizontalOffset(this.get('horizontalAlign'), containerWidth, contentWidth);
      this.set('horizontalScrollOffset', value); // Note: Trigger for _sc_scrollOffsetHorizontalDidChange

    } else if (this._sc_horizontalPct > 0) {
      value = this._sc_horizontalPct * (maximumHorizontalScrollOffset + containerWidth) - (containerWidth / 2);
      this.set('horizontalScrollOffset', value); // Note: Trigger for _sc_scrollOffsetHorizontalDidChange
    }

    if (maximumVerticalScrollOffset === 0) {
      // Align vertically.
      value = this._sc_alignedVerticalOffset(this.get('verticalAlign'), containerHeight, contentHeight);
      this.set('verticalScrollOffset', value); // Note: Trigger for _sc_scrollOffsetHorizontalDidChange

    } else if (this._sc_verticalPct > 0) {
      value = this._sc_verticalPct * (maximumVerticalScrollOffset + containerHeight) - (containerHeight / 2);
      this.set('verticalScrollOffset', value); // Note: Trigger for _sc_scrollOffsetVerticalDidChange
    }

    // Update the minimum and maximum scrollable distance on the scrollers as well as their visibility.
    var proportion;

    if (horizontalScrollerView) {
      if (this.get('autohidesHorizontalScroller')) {
        this.setIfChanged('isHorizontalScrollerVisible', contentWidth > containerWidth);
      }

      // Constrain the proportion to 100%.
      proportion = Math.min(containerWidth / contentWidth, 1.0);
      horizontalScrollerView.setIfChanged('proportion', proportion);
    }

    if (verticalScrollerView) {
      if (this.get('autohidesVerticalScroller')) {
        this.setIfChanged('isVerticalScrollerVisible', contentHeight > containerHeight);
      }

      // Constrain the proportion to 100%.
      proportion = Math.min(containerHeight / contentHeight, 1.0);
      verticalScrollerView.setIfChanged('proportion', proportion);
    }
  },

  /** @private Fade in the horizontal scroller. Each scroller fades in/out independently. */
  _sc_fadeInHorizontalScroller: function () {
    var canScrollHorizontal = this.get('canScrollHorizontal'),
      horizontalScroller = this.get('horizontalScrollerView'),
      delay;

    if (canScrollHorizontal && horizontalScroller && horizontalScroller.get('fadeIn')) {
      if (this._sc_horizontalFadeOutTimer) {
        // Reschedule the current timer (avoid creating a new instance).
        this._sc_horizontalFadeOutTimer.startTime = null;
        this._sc_horizontalFadeOutTimer.schedule();
      } else {
        // Fade in.
        horizontalScroller.fadeIn();

        // Wait the minimum time before fading out again.
        delay = this.get('_sc_minimumFadeOutDelay');
        this._sc_horizontalFadeOutTimer = this.invokeLater(this._sc_fadeOutHorizontalScroller, delay);
      }
    }
  },

  /** @private Fade in the vertical scroller. Each scroller fades in/out independently. */
  _sc_fadeInVerticalScroller: function () {
    var canScrollVertical = this.get('canScrollVertical'),
      verticalScroller = this.get('verticalScrollerView'),
      delay;

    if (canScrollVertical && verticalScroller && verticalScroller.get('fadeIn')) {
      if (this._sc_verticalFadeOutTimer) {
        // Reschedule the current timer (avoid creating a new instance).
        this._sc_verticalFadeOutTimer.startTime = null;
        this._sc_verticalFadeOutTimer.schedule();

      } else {
        // Fade in.
        verticalScroller.fadeIn();

        // Wait the minimum time before fading out again.
        delay = this.get('_sc_minimumFadeOutDelay');
        this._sc_verticalFadeOutTimer = this.invokeLater(this._sc_fadeOutVerticalScroller, delay);
      }
    }
  },

  /** @private Fade out the horizontal scroller. */
  _sc_fadeOutHorizontalScroller: function () {
    var horizontalScroller = this.get('horizontalScrollerView');

    if (horizontalScroller && horizontalScroller.get('fadeOut')) {
      // Fade out.
      horizontalScroller.fadeOut();
    }

    this._sc_horizontalFadeOutTimer = null;
  },

  /** @private Fade out the vertical scroller. */
  _sc_fadeOutVerticalScroller: function () {
    var verticalScroller = this.get('verticalScrollerView');

    if (verticalScroller && verticalScroller.get('fadeOut')) {
      // Fade out.
      verticalScroller.fadeOut();
    }

    this._sc_verticalFadeOutTimer = null;
  },

  /** @private Adjust the content alignment horizontally on change. */
  _sc_horizontalAlignDidChange: function () {
    var maximumHorizontalScrollOffset = this.get('maximumHorizontalScrollOffset');

    // Align horizontally.
    if (maximumHorizontalScrollOffset === 0) {
      var horizontalAlign = this.get('horizontalAlign'),
          value;

      value = this._sc_alignedHorizontalOffset(horizontalAlign, this._sc_containerWidth, this._sc_contentWidth);
      this.set('horizontalScrollOffset', value);
    }
  },

  /** @private
    Calculates the maximum offset given content and container sizes, and the
    alignment.
  */
  _sc_maximumScrollOffset: function (contentSize, containerSize, align, canScroll) {
    // If we can't scroll, we pretend our content size is no larger than the container.
    if (canScroll === NO) contentSize = Math.min(contentSize, containerSize);

    // if our content size is larger than or the same size as the container, it's quite
    // simple to calculate the answer. Otherwise, we need to do some fancy-pants
    // alignment logic (read: simple math)
    if (contentSize >= containerSize) return contentSize - containerSize;

    // alignment, yeah
    if (align === SC.ALIGN_LEFT || align === SC.ALIGN_TOP) {
      // if we left-align something, and it is smaller than the view, does that not mean
      // that it's maximum (and minimum) offset is 0, because it should be positioned at 0?
      return 0;
    } else if (align === SC.ALIGN_MIDDLE || align === SC.ALIGN_CENTER) {
      // middle align means the difference divided by two, because we want equal parts on each side.
      return 0 - Math.round((containerSize - contentSize) / 2);
    } else {
      // right align means the entire difference, because we want all that space on the left
      return 0 - (containerSize - contentSize);
    }
  },

  /** @private
    Calculates the minimum offset given content and container sizes, and the
    alignment.
  */
  _sc_minimumScrollOffset: function (contentSize, containerSize, align, canScroll) {
    // If we can't scroll, we pretend our content size is no larger than the container.
    if (canScroll === NO) contentSize = Math.min(contentSize, containerSize);

    // if the content is larger than the container, we have no need to change the minimum
    // away from the natural 0 position.
    if (contentSize > containerSize) return 0;

    // alignment, yeah
    if (align === SC.ALIGN_LEFT || align === SC.ALIGN_TOP) {
      // if we left-align something, and it is smaller than the view, does that not mean
      // that it's maximum (and minimum) offset is 0, because it should be positioned at 0?
      return 0;
    } else if (align === SC.ALIGN_MIDDLE || align === SC.ALIGN_CENTER) {
      // middle align means the difference divided by two, because we want equal parts on each side.
      return 0 - Math.round((containerSize - contentSize) / 2);
    } else {
      // right align means the entire difference, because we want all that space on the left
      return 0 - (containerSize - contentSize);
    }
  },

  /** @private Registers/deregisters view with SC.Drag for autoscrolling. */
  _sc_registerAutoscroll: function () {
    if (this.get('isVisibleInWindow') && this.get('isEnabledInPane')) {
      SC.Drag.addScrollableView(this);
    } else {
      SC.Drag.removeScrollableView(this);
    }
  },

  /** @private Reposition the content view to match the current scroll offsets and scale. */
  _sc_repositionContentView: function () {
    var contentView = this.get('contentView');

    if (contentView) {
      this.invokeOnce(this._sc_repositionContentViewUnfiltered);
    }
  },

  /** @private Reposition the content view to match the current scroll offsets and scale. */
  _sc_repositionContentViewUnfiltered: function () {
    var containerView = this.get('containerView'),
        contentView = this.get('contentView'),
        horizontalScrollOffset = this.get('horizontalScrollOffset'),
        verticalScrollOffset = this.get('verticalScrollOffset'),
        scale = this.get('scale');

    // If the content is statically laid out, use margins in the container layer to move it.
    // TODO: Remove static layout support.
    if (contentView.useStaticLayout) {
      var containerViewLayer = containerView.get('layer');

      // Set the margins on the layer.
      containerViewLayer.style.marginLeft = -horizontalScrollOffset + 'px';
      containerViewLayer.style.marginTop = -verticalScrollOffset + 'px';

    // Otherwise call adjust on the content.
    } else {
      // Constrain the offsets to full (actual) pixels to prevent blurry text et cetera. Note that this assumes
      // that the scroll view itself is living at a scale of 1, and may give blurry subpixel results if scaled.
      var horizontalAlign = this.get('horizontalAlign'),
        verticalAlign = this.get('verticalAlign'),
        left, top;

      // When the content has an accelerated layer (the transformed position is unscaled).
      if (contentView.get('hasAcceleratedLayer')) {
        left = -horizontalScrollOffset / scale;
      } else {
        left = -horizontalScrollOffset;
      }

      // Round according to the alignment to avoid jitter at the edges. For example, we don't want 0.55 rounding up to 1 when left aligned. This also prevents implied percentage values (i.e. 0.0 > value > 1.0).
      switch (horizontalAlign) {
      case SC.ALIGN_CENTER:
        left = Math.round(left);
        break;
      case SC.ALIGN_RIGHT:
        left = Math.ceil(left);
        break;
      default: // SC.ALIGN_LEFT
        left = Math.floor(left);
      }

      // When the content has an accelerated layer (the transformed position is unscaled).
      if (contentView.get('hasAcceleratedLayer')) {
        top = -verticalScrollOffset / scale;
      } else {
        top = -verticalScrollOffset;
      }

      switch (verticalAlign) {
      case SC.ALIGN_MIDDLE:
        top = Math.round(top);
        break;
      case SC.ALIGN_BOTTOM:
        top = Math.ceil(top);
        break;
      default: // SC.ALIGN_TOP
        top = Math.floor(top);
      }

      if (this._sc_animationDuration) {

        contentView.animate({ left: left, top: top, scale: scale }, {
          duration: this._sc_animationDuration,
          timing: this._sc_animationTiming
        });

        // Run the animation immediately (don't wait for next Run Loop).
        // Note: The next run loop will be queued none-the-less, so we may want to avoid that entirely in the future.
        contentView._animate();

        // Clear out the flag that got us here.
        this._sc_animationDuration = null;
        this._sc_animationTiming = null;
      } else {
        contentView.adjust({
          left: left,
          top: top,
          scale: scale
        });
      }
    }
  },

  /** @private Re-position the scrollers and content depending on the need to scroll or not. */
  _sc_repositionScrollers: function () {
    this.invokeOnce(this._sc_repositionScrollersUnfiltered);
  },

  /** @private Re-position the scrollers and content depending on the need to scroll or not. */
  _sc_repositionScrollersUnfiltered: function () {
    var hasHorizontalScroller = this.get('hasHorizontalScroller'),
      hasVerticalScroller = this.get('hasVerticalScroller'),
      canScrollHorizontal = this.get('canScrollHorizontal'),
      canScrollVertical = this.get('canScrollVertical'),
      containerLayoutMap = SC.ScrollView._SC_CONTAINER_LAYOUT_MAP, // Shared object used to avoid continually initializing/destroying objects.
      horizontalScrollerView = this.get('horizontalScrollerView'),
      horizontalScrollerHeight = horizontalScrollerView ? horizontalScrollerView.get('scrollbarThickness') : 0,
      verticalScrollerView = this.get('verticalScrollerView'),
      verticalScrollerWidth = verticalScrollerView ? verticalScrollerView.get('scrollbarThickness') : 0,
      layout; // The new layout to be applied to each scroller.

    // Create the container layout map once.
    if (!containerLayoutMap) { containerLayoutMap = SC.ScrollView._SC_CONTAINER_LAYOUT_MAP = {}; }

    // Set the standard.
    containerLayoutMap.bottom = 0;
    containerLayoutMap.right = 0;

    // Adjust the horizontal scroller.
    if (hasHorizontalScroller) {
      var horizontalOverlay = this.get('horizontalOverlay'),
        horizontalScrollerLayout = this.get('horizontalScrollerLayout');

      // Adjust the scroller view accordingly. Allow for a custom default scroller layout to be set.
      if (horizontalScrollerLayout) {
        layout = {
          left: horizontalScrollerLayout.left,
          bottom: horizontalScrollerLayout.bottom,
          right: horizontalScrollerLayout.right + verticalScrollerWidth,
          height: horizontalScrollerHeight
        };
      } else {
        layout = {
          left: 0,
          bottom: 0,
          right: verticalScrollerWidth,
          height: horizontalScrollerHeight
        };
      }
      horizontalScrollerView.set('layout', layout);

      // Adjust the content view accordingly.
      if (canScrollHorizontal && !horizontalOverlay) {
        containerLayoutMap.bottom = horizontalScrollerHeight;
      }

      // Set the visibility of the scroller immediately.
      horizontalScrollerView.set('isVisible', canScrollHorizontal);
      this._sc_fadeInHorizontalScroller();
    }

    // Adjust the vertical scroller.
    if (hasVerticalScroller) {
      var verticalOverlay = this.get('verticalOverlay'),
        verticalScrollerLayout = this.get('verticalScrollerLayout');

      // Adjust the scroller view accordingly. Allow for a custom default scroller layout to be set.
      if (verticalScrollerLayout) {
        layout = {
          top: verticalScrollerLayout.top,
          right: verticalScrollerLayout.right,
          bottom: verticalScrollerLayout.bottom + horizontalScrollerHeight,
          width: verticalScrollerWidth
        };
      } else {
        layout = {
          top: 0,
          right: 0,
          bottom: horizontalScrollerHeight,
          width: verticalScrollerWidth
        };
      }
      verticalScrollerView.set('layout', layout);

      // Prepare to adjust the content view accordingly.
      if (canScrollVertical && !verticalOverlay) {
        containerLayoutMap.right = verticalScrollerWidth;
      }

      // Set the visibility of the scroller immediately.
      verticalScrollerView.set('isVisible', canScrollVertical);
      this._sc_fadeInVerticalScroller();
    }

    // Adjust the container view accordingly (i.e. to make space for scrollers or take space back).
    var containerView = this.get('containerView');
    containerView.adjust(containerLayoutMap);
  },

  /** @private Clean up observers on the content view. */
  _sc_removeContentViewObservers: function () {
    var oldView = this._sc_contentView,
      frameChangeFunc = this._sc_contentViewFrameDidChange;
      // layerChangeFunc = this._sc_contentViewLayerDidChange;

    if (oldView) {
      oldView.removeObserver('frame', this, frameChangeFunc);
      // oldView.removeObserver('layer', this, layerChangeFunc);

      this._sc_contentViewFrame = null;
      this._sc_shouldResizeContentWidth = false;
      this._sc_shouldResizeContentHeight = false;
    }
  },

  /** @private Whenever the scale changes, update the scrollers and adjust the location of the content view. */
  _sc_scaleDidChange: function () {
    var contentView = this.get('contentView'),
      scale = this.get('scale');

    // If the content is statically laid out, use margins in the container layer to move it.
    // TODO: Remove static layout support.
    if (contentView) {
      if (contentView.useStaticLayout) {
        //@if(debug)
        // If the scale is not 1 then assume the developer is trying to scale static content.
        if (scale !== 1) {
          SC.warn("Developer Warning: SC.ScrollView's `scale` feature does not support statically laid out content views.");
        }
        //@endif

      // Reposition the content view to apply the scale.
      } else {
        // Apply this change immediately (no need for filtering as is done for the scroll offsets, which may change together).
        this._sc_repositionContentViewUnfiltered();
      }
    }
  },

  /** @private Whenever the scroll offsets change, update the scrollers and adjust the location of the content view. */
  _sc_scrollOffsetHorizontalDidChange: function () {
    this._sc_repositionContentView();
    this.invokeLast(this._sc_fadeInHorizontalScroller);
  },

  /** @private Whenever the scroll offsets change, update the scrollers and adjust the location of the content view. */
  _sc_scrollOffsetVerticalDidChange: function () {
    this._sc_repositionContentView();
    this.invokeLast(this._sc_fadeInVerticalScroller);
  },

  /** @private Adjust the content alignment vertically on change. */
  _sc_verticalAlignDidChange: function () {
    var maximumVerticalScrollOffset = this.get('maximumVerticalScrollOffset');

    // Align vertically.
    if (maximumVerticalScrollOffset === 0) {
      var verticalAlign = this.get('verticalAlign'),
        value;

      value = this._sc_alignedVerticalOffset(verticalAlign, this._sc_containerHeight, this._sc_contentHeight);
      this.set('verticalScrollOffset', value);
    }
  },

  /** @private Instantiate the container view and the scrollers as needed. */
  createChildViews: function () {
    var childViews = [];

    // Set up the container view.
    var containerView = this.get('containerView');

    //@if(debug)
    // Provide some debug-mode only developer support to prevent problems.
    if (!containerView) {
      throw new Error("Developer Error: SC.ScrollView must have a containerView class set before it is instantiated.");
    }
    //@endif

    containerView = this.containerView = this.createChildView(containerView, {
      contentView: this.contentView // Initialize the view with the currently set container view.
    });
    this.contentView = containerView.get('contentView'); // Replace our content view with the instantiated version.
    childViews.push(containerView);

    // Set up the scrollers.
    var scrollerView;

    // Create a horizontal scroller view if needed.
    if (!this.get('hasHorizontalScroller')) {
      // Remove the class entirely.
      this.horizontalScrollerView = null;
    } else {
      scrollerView = this.get('horizontalScrollerView');

      // Use a default scroller view.
      /* jshint eqnull:true */
      if (scrollerView == null) {
        scrollerView = this.get('horizontalOverlay') ? SC.OverlayScrollerView : SC.ScrollerView;
      }

      // Replace the class property with an instance.
      scrollerView = this.horizontalScrollerView = this.createChildView(scrollerView, {
        isVisible: false,
        layoutDirection: SC.LAYOUT_HORIZONTAL,
        value: this.get('horizontalScrollOffset'),
        valueBinding: '.owner.horizontalScrollOffset', // Bind the value of the scroller to our horizontal offset.
        minimum: this.get('minimumHorizontalScrollOffset'),
        maximum: this.get('maximumHorizontalScrollOffset')
      });

      // Add the scroller view to the child views array.
      childViews.push(scrollerView);
    }

    // Create a vertical scroller view if needed.
    if (!this.get('hasVerticalScroller')) {
      // Remove the class entirely.
      this.verticalScrollerView = null;
    } else {
      scrollerView = this.get('verticalScrollerView');

      // Use a default scroller view.
      /* jshint eqnull:true */
      if (scrollerView == null) {
        scrollerView = this.get('verticalOverlay') ? SC.OverlayScrollerView : SC.ScrollerView;
      }

      // Replace the class property with an instance.
      scrollerView = this.verticalScrollerView = this.createChildView(scrollerView, {
        isVisible: false,
        layoutDirection: SC.LAYOUT_VERTICAL,
        value: this.get('verticalScrollOffset'),
        valueBinding: '.owner.verticalScrollOffset', // Bind the value of the scroller to our vertical offset.
        minimum: this.get('minimumVerticalScrollOffset'),
        maximum: this.get('maximumVerticalScrollOffset')
      });

      // Add the scroller view to the child views array.
      childViews.push(scrollerView);
    }

    // Set the childViews array.
    this.childViews = childViews;
  },

  /** @private */
  destroy: function() {
    // Clean up.
    this.removeObserver('horizontalAlign', this, this._sc_horizontalAlignDidChange);
    this.removeObserver('verticalAlign', this, this._sc_verticalAlignDidChange);

    sc_super();
  },

  /** @private SC.View */
  didCreateLayer: function () {
    // Observe the content view for changes and initialize once.
    this.addObserver('contentView', this, this._sc_contentViewDidChange);
    this._sc_contentViewDidChange();

    // Observe the scroll offsets for changes and initialize once.
    this.addObserver('horizontalScrollOffset', this, this._sc_scrollOffsetHorizontalDidChange);
    this.addObserver('verticalScrollOffset', this, this._sc_scrollOffsetVerticalDidChange);
    this._sc_scrollOffsetHorizontalDidChange();
    this._sc_scrollOffsetVerticalDidChange();

    // Observe the scroller visibility properties for changes and initialize once.
    this.addObserver('isHorizontalScrollerVisible', this, this._sc_repositionScrollers);
    this.addObserver('isVerticalScrollerVisible', this, this._sc_repositionScrollers);
    this._sc_repositionScrollers();

    // Observe the scale for changes and initialize once.
    this.addObserver('scale', this, this._sc_scaleDidChange);
    this._sc_scaleDidChange();

    // Observe our container view frame for changes and initialize once.
    var containerView = this.get('containerView');
    containerView.addObserver('frame', this, this._sc_containerViewFrameDidChange);
    this._sc_containerViewFrameDidChange();

    // Observe for changes in enablement and visibility for registering with SC.Drag auto-scrolling and initialize once.
    this.addObserver('isVisibleInWindow', this, this._sc_registerAutoscroll);
    this.addObserver('isEnabledInPane', this, this._sc_registerAutoscroll);
    this._sc_registerAutoscroll();
  },

  /** SC.Object.prototype */
  init: function () {
    sc_super();

    // Observe the alignment properties for changes. No need to initialize, the default alignment property
    // will be used.
    this.addObserver('horizontalAlign', this, this._sc_horizontalAlignDidChange);
    this.addObserver('verticalAlign', this, this._sc_verticalAlignDidChange);
  },

  /**
    Scrolls the receiver in the horizontal and vertical directions by the amount specified, if
    allowed.  The actual scroll amount will be constrained by the current scroll minimums and
    maximums. (If you wish to scroll outside of those bounds, you should call `scrollTo` directly.)

    If you only want to scroll in one direction, pass null or 0 for the other direction.

    @param {Number} x change in the x direction (or hash)
    @param {Number} y change in the y direction
    @returns {SC.ScrollView} receiver
  */
  scrollBy: function (x, y) {
    // Normalize (deprecated).
    if (y === undefined && SC.typeOf(x) === SC.T_HASH) {
      //@if(debug)
      // Add some developer support. It's faster to pass the arguments individually so that we don't need to do this normalization and the
      // developer isn't creating an extra Object needlessly.
      SC.warn("Developer Warning: Passing an object to SC.ScrollView.scrollBy is deprecated. Please pass both the x and y arguments.");
      //@endif

      y = x.y;
      x = x.x;
    }

    // If null, undefined, or 0, pass null; otherwise just add current offset.
    x = (x) ? this.get('horizontalScrollOffset') + x : null;
    y = (y) ? this.get('verticalScrollOffset') + y : null;

    // Constrain within min and max. (Calls to scrollBy are generally convenience calls that should not have to
    // worry about exceeding bounds and making the followup call. Features that want to allow overscroll should call
    // scrollTo directly.)
    if (x !== null) {
      x = Math.min(Math.max(this.get('minimumHorizontalScrollOffset'), x), this.get('maximumHorizontalScrollOffset'));
    }

    if (y !== null) {
      y = Math.min(Math.max(this.get('minimumVerticalScrollOffset'), y), this.get('maximumVerticalScrollOffset'));
    }

    return this.scrollTo(x, y);
  },

  /**
    Scrolls the receiver down one or more lines if allowed.  If number of
    lines is not specified, scrolls one line.

    @param {Number} lines number of lines
    @returns {SC.ScrollView} receiver
  */
  scrollDownLine: function (lines) {
    if (lines === undefined) lines = 1;
    return this.scrollBy(null, this.get('verticalLineScroll') * lines);
  },

  /**
    Scrolls the receiver down one or more page if allowed.  If number of
    pages is not specified, scrolls one page.  The page size is determined by
    the verticalPageScroll value.  By default this is the size of the current
    scrollable area.

    @param {Number} pages number of lines
    @returns {SC.ScrollView} receiver
  */
  scrollDownPage: function (pages) {
    if (pages === undefined) pages = 1;
    return this.scrollBy(null, this.get('verticalPageScroll') * pages);
  },

  /**
    Scrolls the receiver left one or more lines if allowed.  If number of
    lines is not specified, scrolls one line.

    @param {Number} lines number of lines
    @returns {SC.ScrollView} receiver
  */
  scrollLeftLine: function (lines) {
    if (lines === undefined) lines = 1;
    return this.scrollTo(0 - this.get('horizontalLineScroll') * lines, null);
  },

  /**
    Scrolls the receiver left one or more page if allowed.  If number of
    pages is not specified, scrolls one page.  The page size is determined by
    the verticalPageScroll value.  By default this is the size of the current
    scrollable area.

    @param {Number} pages number of lines
    @returns {SC.ScrollView} receiver
  */
  scrollLeftPage: function (pages) {
    if (pages === undefined) pages = 1;
    return this.scrollBy(0 - (this.get('horizontalPageScroll') * pages), null);
  },

  /**
    Scrolls the receiver right one or more lines if allowed.  If number of
    lines is not specified, scrolls one line.

    @param {Number} lines number of lines
    @returns {SC.ScrollView} receiver
  */
  scrollRightLine: function (lines) {
    if (lines === undefined) lines = 1;
    return this.scrollTo(this.get('horizontalLineScroll') * lines, null);
  },

  /**
    Scrolls the receiver right one or more page if allowed.  If number of
    pages is not specified, scrolls one page.  The page size is determined by
    the verticalPageScroll value.  By default this is the size of the current
    scrollable area.

    @param {Number} pages number of lines
    @returns {SC.ScrollView} receiver
  */
  scrollRightPage: function (pages) {
    if (pages === undefined) pages = 1;
    return this.scrollBy(this.get('horizontalPageScroll') * pages, null);
  },

  /**
    Scrolls to the specified x,y coordinates.  This should be the offset into the contentView that
    you want to appear at the top-left corner of the scroll view.

    This method will contain the actual scroll based on whether the view can scroll in the named
    direction and the maximum distance it can scroll.

    If you only want to scroll in one direction, pass null for the other direction.

    @param {Number} x the x scroll location
    @param {Number} y the y scroll location
    @returns {SC.ScrollView} receiver
  */
  scrollTo: function (x, y) {
    // Normalize (deprecated).
    if (y === undefined && SC.typeOf(x) === SC.T_HASH) {
      //@if(debug)
      // Add some developer support. It's faster to pass the arguments individually so that we don't need to do this normalization and the
      // developer isn't creating an extra Object needlessly.
      SC.warn("Developer Warning: Passing an object to SC.ScrollView.scrollTo is deprecated. Please pass both the x and y arguments.");
      //@endif

      y = x.y;
      x = x.x;
    }

    if (!SC.none(x)) {
      this.set('horizontalScrollOffset', x);
    }

    if (!SC.none(y)) {
      this.set('verticalScrollOffset', y);
    }

    return this;
  },

  /**
    Scroll to the supplied rectangle.

    If the rectangle is bigger than the viewport, the top-left
    will be preferred.

    (Note that if your content is scaled, the rectangle must be
    relative to the contentView's scale, not the ScrollView's.)

    @param {Rect} rect Rectangle to which to scroll.
    @returns {Boolean} YES if scroll position was changed.
  */
  scrollToRect: function (rect) {
    // find current visible frame.
    var vo = SC.cloneRect(this.get('containerView').get('frame')),
        origX = this.get('horizontalScrollOffset'),
        origY = this.get('verticalScrollOffset'),
        scale = this.get('scale');

    vo.x = origX;
    vo.y = origY;

    // Scale rect.
    if (scale !== 1) {
      rect = SC.cloneRect(rect);
      rect.x *= scale;
      rect.y *= scale;
      rect.height *= scale;
      rect.width *= scale;
    }

    // if bottom edge is not visible, shift origin
    vo.y += Math.max(0, SC.maxY(rect) - SC.maxY(vo));
    vo.x += Math.max(0, SC.maxX(rect) - SC.maxX(vo));

    // if top edge is not visible, shift origin
    vo.y -= Math.max(0, SC.minY(vo) - SC.minY(rect));
    vo.x -= Math.max(0, SC.minX(vo) - SC.minX(rect));

    // scroll to that origin.
    if ((origX !== vo.x) || (origY !== vo.y)) {
      this.scrollTo(vo.x, vo.y);
      return YES;
    } else {
      return NO;
    }
  },

  /**
    Scrolls the receiver up one or more lines if allowed.  If number of
    lines is not specified, scrolls one line.

    @param {Number} lines number of lines
    @returns {SC.ScrollView} receiver
  */
  scrollUpLine: function (lines) {
    if (lines === undefined) lines = 1;
    return this.scrollBy(null, 0 - this.get('verticalLineScroll') * lines);
  },

  /**
    Scrolls the receiver up one or more page if allowed.  If number of
    pages is not specified, scrolls one page.  The page size is determined by
    the verticalPageScroll value.  By default this is the size of the current
    scrollable area.

    @param {Number} pages number of lines
    @returns {SC.ScrollView} receiver
  */
  scrollUpPage: function (pages) {
    if (pages === undefined) pages = 1;
    return this.scrollBy(null, 0 - (this.get('verticalPageScroll') * pages));
  },

  /**
    Scroll the view to make the view's frame visible.  For this to make sense,
    the view should be a subview of the contentView.  Otherwise the results
    will be undefined.

    @param {SC.View} view view to scroll or null to scroll receiver visible
    @returns {Boolean} YES if scroll position was changed
  */
  scrollToVisible: function (view) {

    // if no view is passed, do default
    if (arguments.length === 0) return sc_super();

    var contentView = this.get('contentView');
    if (!contentView) return NO; // nothing to do if no contentView.

    // get the frame for the view - should work even for views with static
    // layout, assuming it has been added to the screen.
    var viewFrame = view.get('borderFrame');
    if (!viewFrame) return NO; // nothing to do

    // convert view's frame to an offset from the contentView origin.  This
    // will become the new scroll offset after some adjustment.
    viewFrame = contentView.convertFrameFromView(viewFrame, view.get('parentView'));

    return this.scrollToRect(viewFrame);
  },

  /** @private SC.View */
  willDestroyLayer: function () {
    // Clean up.
    this._sc_removeContentViewObservers();
    this.removeObserver('contentView', this, this._sc_contentViewDidChange);

    this.removeObserver('horizontalScrollOffset', this, this._sc_scrollOffsetHorizontalDidChange);
    this.removeObserver('verticalScrollOffset', this, this._sc_scrollOffsetVerticalDidChange);
    this.removeObserver('isHorizontalScrollerVisible', this, this._sc_repositionScrollers);
    this.removeObserver('isVerticalScrollerVisible', this, this._sc_repositionScrollers);

    this.removeObserver('scale', this, this._sc_scaleDidChange);

    var containerView = this.get('containerView');
    containerView.removeObserver('frame', this, this._sc_containerViewFrameDidChange);

    // Be sure to remove this view as a scrollable view for SC.Drag.
    this.removeObserver('isVisibleInWindow', this, this._sc_registerAutoscroll);
    this.removeObserver('isEnabledInPane', this, this._sc_registerAutoscroll);
    SC.Drag.removeScrollableView(this);
  },

  // ---------------------------------------------------------------------------------------------
  // Interaction
  //

  /** @private
    This method gives our descendent views a chance to capture the touch via captureTouch, and subsequently to handle the
    touch, via touchStart. If no view elects to do so, control is returned to the scroll view for standard scrolling.
  */
  _sc_beginTouchesInContent: function (touch) {
    // Clean up.
    this._sc_passTouchToContentTimer = null;

    // If the touch has ended in the mean time, don't proceed.
    if (touch.hasEnded) return;

    // If the touch is not a scroll or scale, see if any of our descendent views want to handle the touch. If not,
    // we keep our existing respondership and all is well.
    if (!touch.captureTouch(this, true)) { touch.makeTouchResponder(touch.targetView, true, this); }
  },

  /** @private */
  _sc_touchEnded: function (touch) {
    // When the last touch ends, we stop touch scrolling.
    var hasTouch = this.get('hasTouch');
    if (hasTouch) {
      // Update the average distance to center of the touch to include the new touch. This is used to recognize pinch/zoom movement of the touch.
      var avgTouch = touch.averagedTouchesForView(this);

      this._sc_gestureAnchorD = avgTouch.d;
      this._sc_gestureAnchorX = avgTouch.x;
      this._sc_gestureAnchorY = avgTouch.y;

      // When there is only one touch left, we can't scale any longer so force it to false.
      if (this._sc_gestureAnchorD === 0) {
        this._sc_isTouchScaling = false;
      }
    } else {
      // If we were scrolling, continue scrolling at present velocity with deceleration.
      if (this._sc_isTouchScrollingV || this._sc_isTouchScrollingH || this._sc_isTouchScaling) {
        var decelerationRate = this.get('decelerationRate'),
          containerHeight = this._sc_containerHeight,
          containerWidth = this._sc_containerWidth,
          durationH = 0,
          durationV = 0,
          c2x, c2y;

        if (this._sc_isTouchScrollingH) {
          var horizontalScrollOffset = this.get('horizontalScrollOffset'),
            maximumHorizontalScrollOffset = this.get('maximumHorizontalScrollOffset'),
            minimumHorizontalScrollOffset = this.get('minimumHorizontalScrollOffset'),
            horizontalVelocity = this._sc_touchVelocityH;

          // Past the maximum.
          if (horizontalScrollOffset > maximumHorizontalScrollOffset) {
            this.set('horizontalScrollOffset', maximumHorizontalScrollOffset);

            // Moving away from maximum. Change direction.
            if (horizontalVelocity < 0.2) {
              this._sc_animationTiming = this.get('animationCurveReverse');

            // Stopped or moving back towards maximum. Maintain direction, snap at the end.
            } else {
              this._sc_animationTiming = this.get('animationCurveSnap');
            }

            // 0.8 seconds for a full screen animation (most will be 50% or less of screen)
            durationH = 0.8 * (horizontalScrollOffset - maximumHorizontalScrollOffset) / containerWidth;

          // Bounce back from min.
          } else if (horizontalScrollOffset < minimumHorizontalScrollOffset) {
            this.set('horizontalScrollOffset', minimumHorizontalScrollOffset);

            // Moving away from minimum. Change direction.
            if (horizontalVelocity > 0.2) {
              this._sc_animationTiming = this.get('animationCurveReverse');

            // Stopped or moving back towards minimum. Maintain direction, snap at the end.
            } else {
              this._sc_animationTiming = this.get('animationCurveSnap');
            }

            // 0.8 seconds for a full screen animation (most will be 50% or less of screen)
            durationH = 0.8 * (minimumHorizontalScrollOffset - horizontalScrollOffset) / containerWidth;

          // Slide.
          } else {
            // Set the final position we should slide to as we decelerate based on last velocity.
            horizontalScrollOffset -= (Math.abs(horizontalVelocity) * horizontalVelocity * 1000) / (2 * decelerationRate);

            // Constrain within bounds.
            if (horizontalScrollOffset > maximumHorizontalScrollOffset) {
              // Generate an animation curve that bounces past the end point.
              c2x = (horizontalScrollOffset - maximumHorizontalScrollOffset) / containerWidth;
              c2y = 2 * c2x;
              this._sc_animationTiming = 'cubic-bezier(0.0,0.5,%@,%@)'.fmt(c2x.toFixed(1), c2y.toFixed(1));

              horizontalScrollOffset = maximumHorizontalScrollOffset;

            } else if (horizontalScrollOffset < minimumHorizontalScrollOffset) {
              // Generate an animation curve that bounces past the end point.
              c2x = (minimumHorizontalScrollOffset - horizontalScrollOffset) / containerWidth;
              c2y = 2 * c2x;
              this._sc_animationTiming = 'cubic-bezier(0.0,0.5,%@,%@)'.fmt(c2x.toFixed(1), c2y.toFixed(1));

              horizontalScrollOffset = minimumHorizontalScrollOffset;

            } else {
              this._sc_animationTiming = this.get('animationCurveDecelerate');
            }

            this.set('horizontalScrollOffset', horizontalScrollOffset);

            durationH = Math.abs(horizontalVelocity / decelerationRate);
          }
        }

        if (this._sc_isTouchScrollingV) {
          var verticalScrollOffset = this.get('verticalScrollOffset'),
            maximumVerticalScrollOffset = this.get('maximumVerticalScrollOffset'),
            minimumVerticalScrollOffset = this.get('minimumVerticalScrollOffset'),
            verticalVelocity = this._sc_touchVelocityV;

          // Past the maximum.
          if (verticalScrollOffset > maximumVerticalScrollOffset) {
            this.set('verticalScrollOffset', maximumVerticalScrollOffset);

            // Moving away from maximum. Change direction.
            if (verticalVelocity < 0.2) {
              this._sc_animationTiming = this.get('animationCurveReverse');

            // Stopped or moving back towards maximum. Maintain direction, snap at the end.
            } else {
              this._sc_animationTiming = this.get('animationCurveSnap');
            }

            // 0.8 seconds for a full screen animation (most will be 50% or less of screen)
            durationV = 0.8 * (verticalScrollOffset - maximumVerticalScrollOffset) / containerHeight;

          // Bounce back from min.
          } else if (verticalScrollOffset < minimumVerticalScrollOffset) {
            this.set('verticalScrollOffset', minimumVerticalScrollOffset);

            // Moving away from minimum. Change direction.
            if (verticalVelocity > 0.2) {
              this._sc_animationTiming = this.get('animationCurveReverse');

            // Stopped or moving back towards minimum. Maintain direction, snap at the end.
            } else {
              this._sc_animationTiming = this.get('animationCurveSnap');
            }

            // 0.8 seconds for a full screen animation (most will be 50% or less of screen)
            durationV = 0.8 * (minimumVerticalScrollOffset - verticalScrollOffset) / containerHeight;

          // Slide.
          } else {
            // Set the final position we should slide to as we decelerate based on last velocity.
            verticalScrollOffset -= (Math.abs(verticalVelocity) * verticalVelocity * 1000) / (2 * decelerationRate);

            // Constrain within bounds.
            if (verticalScrollOffset > maximumVerticalScrollOffset) {
              // Generate an animation curve that bounces past the end point.
              c2x = (verticalScrollOffset - maximumVerticalScrollOffset) / containerHeight;
              c2y = 2 * c2x;
              this._sc_animationTiming = 'cubic-bezier(0.0,0.5,%@,%@)'.fmt(c2x.toFixed(1), c2y.toFixed(1));

              verticalScrollOffset = maximumVerticalScrollOffset;

            } else if (verticalScrollOffset < minimumVerticalScrollOffset) {
              // Generate an animation curve that bounces past the end point.
              c2x = (minimumVerticalScrollOffset - verticalScrollOffset) / containerHeight;
              c2y = 2 * c2x;
              this._sc_animationTiming = 'cubic-bezier(0.0,0.5,%@,%@)'.fmt(c2x.toFixed(1), c2y.toFixed(1));

              verticalScrollOffset = minimumVerticalScrollOffset;

            } else {
              this._sc_animationTiming = this.get('animationCurveDecelerate');
            }

            this.set('verticalScrollOffset', verticalScrollOffset);

            durationV = Math.abs(verticalVelocity / decelerationRate);
          }
        }

        var scale = this.get('scale'),
          maximumScale = this.get('maximumScale'),
          minimumScale = this.get('minimumScale'),
          durationS = 0;

        // Bounce back from max.
        if (scale > maximumScale) {
          this.set('scale', maximumScale);
          durationS = 0.25;

        // Bounce back from min.
        } else if (scale < minimumScale) {
          this.set('scale', minimumScale);
          durationS = 0.25;

        // Slide.
        } else {

        }

        // Determine how long the deceleration should take (we can't animate left/top separately, so use the largest duration for both).
        // This variable also acts as a flag so that when the content view is repositioned, it will be animated.
        this._sc_animationDuration = Math.max(Math.max(durationH, durationV), durationS);

        // Clear up all caches from touchesDragged.
        this._sc_isTouchScrollingH = false;
        this._sc_isTouchScrollingV = false;
        this._sc_isTouchScaling = false;
        this._sc_touchVelocityH = null;
        this._sc_touchVelocityV = null;
      }

      // Clean up all caches from touchStart.
      this._sc_gestureAnchorX = null;
      this._sc_gestureAnchorY = null;
      this._sc_gestureAnchorD = null;
    }

    // TODO: What happens when isEnabledInPane goes false while interacting? Statechart would help solve this.
    return true;
  },

  /** @private @see SC.RootResponder.prototype.captureTouch */
  captureTouch: function (touch) {
    // Capture the touch and begin determination of actual scroll or not.
    if (this.get('delaysContentTouches')) {
      return true;

    // Otherwise, suggest ourselves as a reasonable fallback responder. If none of our children capture
    // the touch or handle touchStart, we'll get another crack at it in touchStart.
    } else {
      touch.stackCandidateTouchResponder(this);

      return false;
    }
  },

  /** @private */
  mouseWheel: function (evt) {
    var handled = false,
      contentView = this.get('contentView');

    // Ignore it if not enabled.
    if (contentView && this.get('isEnabledInPane')) {

      var horizontalScrollOffset = this.get('horizontalScrollOffset'),
        minimumHorizontalScrollOffset = this.get('minimumHorizontalScrollOffset'),
        minimumVerticalScrollOffset = this.get('minimumVerticalScrollOffset'),
        maximumHorizontalScrollOffset = this.get('maximumHorizontalScrollOffset'),
        maximumVerticalScrollOffset = this.get('maximumVerticalScrollOffset'),
        verticalScrollOffset = this.get('verticalScrollOffset'),
        wheelDeltaX = evt.wheelDeltaX,
        wheelDeltaY = evt.wheelDeltaY;

      // If we can't scroll in one direction, limit that direction.
      if (!this.get('canScrollHorizontal')) { // Don't allow inverted scrolling for now.
        wheelDeltaX = 0;
      }

      if (!this.get('canScrollVertical')) { // Don't allow inverted scrolling for now.
        wheelDeltaY = 0;
      }

      // Only attempt to scroll if we are allowed to scroll in the direction and have room to scroll
      // in the direction. Otherwise, ignore the event so that an outer ScrollView may capture it.
      // handled = ((wheelDeltaX < 0 && horizontalScrollOffset > minimumHorizontalScrollOffset) ||
      //     (wheelDeltaX > 0 && horizontalScrollOffset < maximumHorizontalScrollOffset)) ||
      //     ((wheelDeltaY < 0 && verticalScrollOffset > minimumVerticalScrollOffset) ||
      //     (wheelDeltaY > 0 && verticalScrollOffset < maximumVerticalScrollOffset));
      handled = ((wheelDeltaX < 0 && horizontalScrollOffset > minimumHorizontalScrollOffset) ||
                 (wheelDeltaX > 0 && horizontalScrollOffset < maximumHorizontalScrollOffset)) ||
                ((wheelDeltaY < 0 && verticalScrollOffset > minimumVerticalScrollOffset) ||
                  (wheelDeltaY > 0 && verticalScrollOffset < maximumVerticalScrollOffset));

      if (handled) {
        this.scrollBy(wheelDeltaX, wheelDeltaY);
      }
    }

    return handled;
  },

  /** @private */
  touchesDragged: function (evt, touchesForView) {
    var avg = evt.averagedTouchesForView(this),
        scrollThreshold = this.get('scrollGestureThreshold'),
        scaleThreshold = this.get('scaleGestureThreshold'),

        // Changes in x and y since the last initialization.
        touchDeltaX = this._sc_gestureAnchorX - avg.x,
        touchDeltaY = this._sc_gestureAnchorY - avg.y,
        touchDeltaD = this._sc_gestureAnchorD - avg.d;

    // Determine if we've moved enough to switch to horizontal scrolling.
    if (!this._sc_isTouchScrollingH) {
      var absDeltaX = Math.abs(touchDeltaX);

      this._sc_isTouchScrollingH = this.get('canScrollHorizontal') && absDeltaX >= scrollThreshold;
    }

    // Determine if we've moved enough to switch to vertical scrolling.
    if (!this._sc_isTouchScrollingV) {
      var absDeltaY = Math.abs(touchDeltaY);

      this._sc_isTouchScrollingV = this.get('canScrollVertical') && absDeltaY >= scrollThreshold;
    }

    // Determine if we've moved enough to switch to scaling.
    if (!this._sc_isTouchScaling) {
      var absDeltaD = Math.abs(touchDeltaD);

      this._sc_isTouchScaling = !!avg.d && absDeltaD > scaleThreshold;
    }

    // Adjust scale.
    if (this._sc_isTouchScaling) {
      var touchPercentChange = (avg.d - (touchDeltaD * 0.5)) / avg.d, // The percentage difference in touch distance (halved b/c two touches moving in opposite directions doubles the difference).
          scale = this.get('scale');

      scale = scale * touchPercentChange;

      this.set('scale', scale);

      // Reset the difference each time so that we don't scale exponentially.
      this._sc_gestureAnchorD = avg.d;

    // Adjust scroll.
    } else {
      if (this._sc_isTouchScrollingH) {
        // Record the last velocity.
        this._sc_touchVelocityH = avg.velocityX;

        var maximumHorizontalScrollOffset = this.get('maximumHorizontalScrollOffset'),
          minimumHorizontalScrollOffset = this.get('minimumHorizontalScrollOffset');

        // Degrade the offset as we pass maximum.
        if (touchDeltaX > maximumHorizontalScrollOffset) {
          touchDeltaX = touchDeltaX - this._sc_overDragSlip * (touchDeltaX - maximumHorizontalScrollOffset);

        // Degrade the offset as we pass minimum.
        } else if (touchDeltaX < minimumHorizontalScrollOffset) {
          touchDeltaX = touchDeltaX + this._sc_overDragSlip * (minimumHorizontalScrollOffset - touchDeltaX);
        }

        // Update the scroll offset.
        this.set('horizontalScrollOffset', touchDeltaX);
      }

      if (this._sc_isTouchScrollingV) {
        // Record the last velocity.
        this._sc_touchVelocityV = avg.velocityY;

        var maximumVerticalScrollOffset = this.get('maximumVerticalScrollOffset'),
          minimumVerticalScrollOffset = this.get('minimumVerticalScrollOffset');

        // Degrade the offset as we pass maximum.
        if (touchDeltaY > maximumVerticalScrollOffset) {
          touchDeltaY = touchDeltaY - this._sc_overDragSlip * (touchDeltaY - maximumVerticalScrollOffset);

        // Degrade the offset as we pass minimum.
        } else if (touchDeltaY < minimumVerticalScrollOffset) {
          touchDeltaY = touchDeltaY + this._sc_overDragSlip * (minimumVerticalScrollOffset - touchDeltaY);
        }

        // Update the scroll offset.
        this.set('verticalScrollOffset', touchDeltaY);
      }
    }

    // No longer pass the initial touch on to the content view if it was still about to.
    if (this._sc_passTouchToContentTimer && (this._sc_isTouchScrollingV || this._sc_isTouchScrollingH || this._sc_isTouchScaling)) {
      this._sc_passTouchToContentTimer.invalidate();
      this._sc_passTouchToContentTimer = null;
    }

  },

  /** @private
    If we're in hand-holding mode and our content claims the touch, we will receive a touchCancelled
    event at its completion. We still need to do most of our touch-ending wrap up, for example to finish
    bouncing back from a previous gesture.
  */
  touchCancelled: function (touch) {
    return this._sc_touchEnded(touch, true);
  },

  /** @private
    If we are the touch's responder at its completion, we'll get a touchEnd event. If this is the
    gesture's last touch, we wrap up in spectacular fashion.
  */
  touchEnd: function (touch) {
    return this._sc_touchEnded(touch);
  },

  // /** @private */
  touchStart: function (touch) {
    var handled = false,
      contentView = this.get('contentView');

    if (contentView && this.get('isEnabledInPane')) {
      var hasTouch = this.get('hasTouch');

      // Additional touches can be used for pinching gestures.
      if (hasTouch) {
        // Update the average distance to center of the touch, which is used to recognize pinch/zoom movement of the touch.
        var avgTouch = touch.averagedTouchesForView(this, true);

        this._sc_gestureAnchorD = avgTouch.d;
        this._sc_gestureAnchorX = avgTouch.x;
        this._sc_gestureAnchorY = avgTouch.y;

        // If a new touch has appeared, force scrolling to recalculate.
        this._sc_isTouchScrollingV = this._sc_isTouchScrollingH = false;

      // The first touch is used to set up initial state.
      } else {
        // Cancel any active animation in place.
        this._sc_cancelAnimation();

        // Get the initial touch point from which deltas will be calculated while dragging.
        this._sc_gestureAnchorX = this.get('horizontalScrollOffset') + touch.pageX;
        this._sc_gestureAnchorY = this.get('verticalScrollOffset') + touch.pageY;
        this._sc_gestureAnchorD = 0;

        // If we have captured the touch and are not yet scrolling, we may want to delay a moment to test for
        // scrolling and if not scrolling, we will pass the touch through to the content.
        // If configured to do so, delay 150ms to verify that the user is not scrolling before passing touches through to the content.
        if (this.get('delaysContentTouches')) {
          this._sc_passTouchToContentTimer = this.invokeLater(this._sc_beginTouchesInContent, 150, touch);
        } // Else do nothing.
      }

      handled = true;
    }

    return handled;
  }

});
