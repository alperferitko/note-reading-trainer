export const DELETE_ACCOUNT_CONFIRMATION = "DELETE MY ACCOUNT";

export async function deleteCurrentAccount(client) {
  const { data, error } = await client.functions.invoke("delete-account", {
    body: {
      confirmation: DELETE_ACCOUNT_CONFIRMATION,
    },
  });

  if (error) {
    throw new Error("delete_account_failed");
  }

  return data;
}
