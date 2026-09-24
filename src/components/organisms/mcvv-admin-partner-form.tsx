import { savePartner } from "@/lib/admin/partners";
import { AdminField } from "@/components/organisms/mcvv-admin-field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { partnerLogoSrc } from "@/lib/partners/logos";

export type PartnerFormValues = {
  id?: number;
  name: string;
  link: string;
  image: string;
  category: number;
  order: number;
  active: boolean;
  description: string;
};

export function McvvAdminPartnerForm({
  values,
  copy,
}: {
  values: PartnerFormValues;
  copy: {
    name: string;
    link: string;
    image: string;
    upload: string;
    category: string;
    order: string;
    active: string;
    description: string;
    save: string;
  };
}) {
  const logo = partnerLogoSrc(values.image);

  return (
    <form action={savePartner} className="grid max-w-2xl gap-4" encType="multipart/form-data">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <AdminField name="name" label={copy.name} defaultValue={values.name} />
      <AdminField name="link" label={copy.link} defaultValue={values.link} />
      <AdminField name="image" label={copy.image} defaultValue={values.image} />
      <AdminField name="logo" label={copy.upload} type="file" />
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-16 w-auto max-w-[12rem] bg-white object-contain p-2" />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField
          name="category"
          label={copy.category}
          type="number"
          defaultValue={values.category}
        />
        <AdminField name="order" label={copy.order} type="number" defaultValue={values.order} />
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="active" defaultChecked={values.active} className="size-4" />
        {copy.active}
      </label>
      <AdminField name="description" label={copy.description}>
        <Textarea
          id="description"
          name="description"
          defaultValue={values.description}
          className="min-h-24 bg-race-surface"
        />
      </AdminField>
      <Button
        type="submit"
        className="h-11 w-fit bg-race-accent font-display font-semibold text-white hover:bg-race-accent-hover"
      >
        {copy.save}
      </Button>
    </form>
  );
}
