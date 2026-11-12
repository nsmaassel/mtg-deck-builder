import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RichText } from './RichText';

describe('RichText', () => {
  it('renders bold, italics and code without their markers', () => {
    const { container } = render(<RichText text={'Craft **Steam Vents** first, *then* the `rest`.'} />);
    expect(screen.getByText('Steam Vents').tagName).toBe('STRONG');
    expect(screen.getByText('then').tagName).toBe('EM');
    expect(screen.getByText('rest').tagName).toBe('CODE');
    expect(container.textContent).toBe('Craft Steam Vents first, then the rest.');
  });

  it('turns bullet lines into a list and keeps paragraphs apart', () => {
    const { container } = render(
      <RichText text={'You are closest to **Izzet Aggro**.\n\n- **Duress** (close)\n- **Divest** (close)\n  - costs the same\n\nLoad a collection for more.'} />,
    );
    expect(container.querySelectorAll('p')).toHaveLength(2);
    expect(container.querySelectorAll('ul > li')).toHaveLength(3);
    expect(container.querySelector('li.rich-nested')?.textContent).toBe('costs the same');
  });

  it('numbers an ordered list', () => {
    const { container } = render(<RichText text={'1. Craft the lands\n2. Swap the rest'} />);
    expect([...container.querySelectorAll('ol > li')].map(li => li.textContent)).toEqual(['Craft the lands', 'Swap the rest']);
  });

  it('keeps one list when the items have blank lines between them', () => {
    const { container } = render(<RichText text={'1. Craft the lands\n\n2. Swap the rest\n\n3. Add the sideboard\n\nThat is all.'} />);
    expect(container.querySelectorAll('ol')).toHaveLength(1);
    expect(container.querySelectorAll('ol > li')).toHaveLength(3);
    expect(container.querySelectorAll('p')).toHaveLength(1);
  });

  it('starts a new list when the kind of list changes', () => {
    const { container } = render(<RichText text={'- one\n- two\n\n1. first\n2. second'} />);
    expect(container.querySelectorAll('ul > li')).toHaveLength(2);
    expect(container.querySelectorAll('ol > li')).toHaveLength(2);
  });

  it('shows a heading as a line of its own and drops rules', () => {
    const { container } = render(<RichText text={'### Main deck\nFour swaps.\n\n---\n\nDone.'} />);
    expect(container.querySelector('.rich-heading')?.textContent).toBe('Main deck');
    expect(container.textContent).not.toContain('#');
    expect(container.textContent).not.toContain('---');
  });

  it('replaces a LaTeX arrow with a plain one', () => {
    const { container } = render(<RichText text={'4x **Flow State** $\\rightarrow$ 4x **Stock Up**'} />);
    expect(container.textContent).toBe('4x Flow State → 4x Stock Up');
  });

  it('never turns the answer into markup or links', () => {
    const { container } = render(<RichText text={'<img src=x onerror=alert(1)> see [this](https://example.test) and <b>bold</b>'} />);
    expect(container.querySelector('img, a, b')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(container.textContent).toContain('[this](https://example.test)');
  });

  it('leaves an unmatched asterisk alone', () => {
    const { container } = render(<RichText text={'2 * 3 is 6, and *this is not closed'} />);
    expect(container.querySelector('em, strong')).toBeNull();
    expect(container.textContent).toBe('2 * 3 is 6, and *this is not closed');
  });
});
