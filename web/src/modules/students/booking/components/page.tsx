"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AcademyGate } from "@/modules/auth";

import { BookingRegistrationsList } from "./registrations";
import { BookingSettingsPanel } from "./settings";

/** Manage → Bookings: the registrations the form produced and its settings, one tab each. */
export function StudentBookingPage() {
  return (
    <AcademyGate>
      {(academy) => (
        <main className="page-shell min-w-0">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            <h1 className="text-2xl font-bold tracking-tight">Bookings</h1>
            <Tabs defaultValue="registrations" className="gap-8">
              <TabsList variant="line" className="w-full justify-start border-b">
                <TabsTrigger value="registrations" className="flex-none">Registrations</TabsTrigger>
                <TabsTrigger value="settings" className="flex-none">Settings</TabsTrigger>
              </TabsList>
              <TabsContent value="registrations"><BookingRegistrationsList academy={academy} /></TabsContent>
              <TabsContent value="settings"><BookingSettingsPanel academy={academy} /></TabsContent>
            </Tabs>
          </div>
        </main>
      )}
    </AcademyGate>
  );
}
