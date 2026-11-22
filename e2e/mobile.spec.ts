import { expect, test } from "./test"

test("/karta: the mobile sheet opens and closes", async ({
  page,
  problems,
}) => {
  await page.goto("/karta?lat=45.81310&lon=15.97750&t=08:00&m=30")
  const sheet = page.getByRole("dialog", { name: "Doseg" })
  const toggle = sheet.getByRole("button", { name: /detalje dosega/u })
  await expect(toggle).toContainText(/\d+ km² za 30 min/u)
  const details = sheet.getByRole("link", { name: "Cijela statistika" })
  await expect(toggle).toHaveAttribute("aria-expanded", "false")
  await expect(details).not.toBeInViewport()

  await toggle.click()
  await expect(toggle).toHaveAccessibleName("Sakrij detalje dosega")
  await expect(details).toBeInViewport()

  await toggle.click()
  await expect(toggle).toHaveAccessibleName("Prikaži detalje dosega")
  await expect(details).not.toBeInViewport()
  expect(problems).toEqual([])
})
