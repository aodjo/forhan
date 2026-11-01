import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPage, isSafeDocumentLink, validateDocument, validatePage } from '../src/documents.ts';

test('document links preserve ordinary references and reject executable schemes',
  /**
   * Verify that portable hyperlink metadata cannot introduce an executable URL.
   *
   * Supported web, local and bookmark references remain available without any
   * network access, while script schemes and embedded control characters fail validation.
   *
   * @returns {void} Completes the hyperlink policy assertions.
   * @throws {AssertionError} If an executable destination is accepted or a valid reference is rejected.
   * @example
   * isSafeDocumentLink('https://example.com'); // true
   */
  () => {
    /** Ordinary document references that must survive local document editing. */
    const supported = ['https://example.com/한글?x=1&y=2', 'mailto:hello@example.com', 'tel:+82212345678', 'file:///C:/Documents/report.hwpx', '#chapter-one', '../appendix.hwpx'];
    /** Each ordinary reference validated without following its destination. */
    for (const href of supported) assert.equal(isSafeDocumentLink(href), true, href);
    /** Executable schemes and control-character variants that must never enter markup. */
    const blocked = ['javascript:alert(1)', ' JAVASCRIPT:alert(1)', 'vbscript:msgbox(1)', 'data:text/html,<script>alert(1)</script>', 'java\tscript:alert(1)', ''];
    /** Each unsupported destination checked before editor or file export code can use it. */
    for (const href of blocked) assert.equal(isSafeDocumentLink(href), false, href);
    assert.throws(
      /**
       * Validate an imported tree containing an executable hyperlink mark.
       *
       * The source is rejected before it can replace an already open document.
       *
       * @returns {void} Does not return because document validation fails.
       * @throws {Error} The document contains an unsupported executable link target.
       * @example
       * // Importing this tree must fail before rendering the anchor.
       */
      () => { validateDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '링크', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] }); }, /링크/);
  });

test('page validation keeps physical geometry consistent and rejects unusable margins',
  /**
   * Verify that physical paper geometry remains usable for rendering and native PDF output.
   *
   * Normal portrait and landscape settings survive unchanged while impossible
   * margins and non-finite dimensions fail before they affect document layout.
   *
   * @returns {void} Completes the valid and invalid page-geometry assertions.
   * @throws {AssertionError} If invalid paper geometry is accepted.
   * @example
   * validatePage({ width: 297, height: 210 }); // A4 landscape with default margins.
   */
  () => {
    assert.deepEqual(validatePage(), defaultPage());
    assert.equal(validatePage({ width: 297, height: 210 }).width, 297);
    assert.throws(
      /**
       * Reject margins that leave no usable text area.
       *
       * The selected margins overlap on the default A4 paper width.
       *
       * @returns {void} Does not return because the geometry is invalid.
       * @throws {Error} The combined margins leave insufficient space for text.
       * @example
       * // Two 150 mm horizontal margins cannot fit inside 210 mm paper.
       */
      () => { validatePage({ marginLeft: 150, marginRight: 150 }); }, /여백/);
    assert.throws(
      /**
       * Reject a non-finite physical paper dimension.
       *
       * Non-finite values must never reach layout styles or print settings.
       *
       * @returns {void} Does not return because the geometry is invalid.
       * @throws {Error} The requested width is not a finite measurement.
       * @example
       * // An infinite paper width fails document validation.
       */
      () => { validatePage({ width: Infinity }); }, /용지/);
  });
