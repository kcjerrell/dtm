import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import PanelList, { PanelListCommand } from "./PanelList"
import { proxy, useSnapshot } from "valtio"
import { PanelListItem } from '.'

// Mock useSelectableGroup
vi.mock("@/hooks/useSelectableV", () => ({
	useSelectableGroup: (itemsSnap: any[], getItems: any) => ({
		SelectableGroup: ({ children }: any) => <div data-testid="selectable-group">{children}</div>,
		selectedItems: itemsSnap.filter((i: any) => i.selected),
	}),
}))

vi.mock("@chakra-ui/react", () => ({
	HStack: ({ children, ...props }: any) => (
		<div data-testid="hstack" {...props}>
			{children}
		</div>
	),
	VStack: ({ children, ...props }: any) => (
		<div data-testid="vstack" {...props}>
			{children}
		</div>
	),
}))

// Mock other components
vi.mock(".", () => ({
	IconButton: ({ children, onClick, disabled }: any) => (
		<button onClick={onClick} disabled={disabled} data-testid="icon-button">
			{children}
		</button>
	),
	PaneListContainer: ({ children }: any) => <div data-testid="pane-list-container">{children}</div>,
	PanelListItem: ({ children }: any) => <div data-testid="panel-list-item">{children}</div>,
	PanelSectionHeader: ({ children }: any) => (
		<div data-testid="panel-section-header">{children}</div>
	),
	Tooltip: ({ children, tip }: any) => <div title={tip as string}>{children}</div>,
}))

vi.mock("./common", () => ({
	PaneListScrollContainer: ({ children }: any) => (
		<div data-testid="scroll-container">{children}</div>
	),
	PanelListScrollContent: ({ children }: any) => <div data-testid="scroll-content">{children}</div>,
}))

describe("PanelList", () => {
	it("renders header correctly", () => {
		const items = proxy([])
		render(<PanelList itemsState={() => []} itemsSnap={items} header="Test Header" />)
		expect(screen.getByText("Test Header")).toBeInTheDocument()
	})

	it("renders commands and handles clicks", () => {
		const items = proxy([{ id: 1, selected: true }])
		const onClickMock = vi.fn()
		const command: PanelListCommand<any> = {
			id: "cmd1",
			icon: () => <span>CmdIcon</span>,
			onClick: onClickMock,
		}

		render(
			<PanelList
				itemsState={() => [{ id: 1, selected: true }]}
				itemsSnap={items}
				commands={[command]}
			/>,
		)

		const button = screen.getByTestId("icon-button")
		expect(button).toBeInTheDocument()
		expect(screen.getByText("CmdIcon")).toBeInTheDocument()

		fireEvent.click(button)
		expect(onClickMock).toHaveBeenCalled()
	})

	it("disables command when selection requirement not met", () => {
		const items = proxy(["something"]) // No selection
    const itemsSnap = useSnapshot(items)
		const command: PanelListCommand<any> = {
			id: "cmd1",
			icon: () => <span>CmdIcon</span>,
			onClick: vi.fn(),
			requiresSelection: true,
		}

		render(
			<PanelList itemsState={() => []} itemsSnap={itemsSnap} commands={[command]}>
				{items.map((item) => (<PanelListItem key={item}>{item}</PanelListItem>))}
			</PanelList>,
		)

		const button = screen.getByTestId("icon-button")
		expect(button).toBeDisabled()

		const item = screen.getByText("something")
		expect(item).toBeInTheDocument()
		item.click()
		expect(button).not.toBeDisabled()
	})
})
